'use strict';

/**
 * costream/sessionService.js
 *
 * Implements POST /audit/v1/costream/session (Section 5.5).
 *
 * Five validation steps executed in exact spec order:
 *   1. Schema (400 VALIDATION_ERROR)
 *   2. Player existence + host-in-participants (404 / 400)
 *   3. Max capacity >4 (409 COSTREAM_SESSION_FULL)
 *   4. Layout capacity vs participant count BEFORE host drop (400 UNSUPPORTED_LAYOUT)
 *   5. Host-drop handoff state machine
 *
 * Decision (layout capacity check — spec conflict resolved):
 *   Step 4 uses the ORIGINAL participants array length (before host drop).
 *   Rationale: the spec lists step 4 before step 5; "effective active
 *   participant count" refers to what the caller requested, not the result
 *   after the simulated drop.  Documented in TRACEABILITY.md.
 *
 * Idempotency:
 *   Same session_id + same request_hash → 200 + stored response (no re-insert).
 *   Same session_id + different payload  → 200 + stored response (replay wins).
 *
 * Signature entity_id  = session_id
 * Signature sig_payload = { active_host, handoff_occurred, layout,
 *                           participant_count, session_id, status }
 */

const crypto  = require('crypto');
const db      = require('../../config/db');
const { sign_day2, throwValidation, throwNotFound, throwConflict, AppError } = require('../../shared');

// ── Constants ──────────────────────────────────────────────────────────────────
const VALID_LAYOUTS    = ['solo', 'grid_2', 'grid_4', 'spotlight'];
const DEFAULT_LAYOUT   = 'grid_4';
const MAX_PARTICIPANTS = 4;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** SHA-256 fingerprint of the canonical request body for idempotency checks */
function requestHash(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      session_id:         body.session_id,
      host_player_id:     body.host_player_id,
      participants:       [...(body.participants || [])].sort(), // order-independent
      layout:             body.layout || DEFAULT_LAYOUT,
      simulate_host_drop: body.simulate_host_drop ?? false,
    }))
    .digest('hex');
}

/** Build the sig_payload per Section 5.3 (6 keys, sorted by canonical) */
function buildSigPayload(sessionId, status, activeHost, handoffOccurred, layout, participantCount) {
  return {
    active_host:       activeHost,
    handoff_occurred:  handoffOccurred,
    layout,
    participant_count: participantCount,
    session_id:        sessionId,
    status,
  };
}

/** Build composite playback + chat room values */
function buildUrls(sessionId) {
  const host = process.env.MEDIA_HOST || 'localhost';
  const port = process.env.MEDIA_HLS_PORT || 8888;
  return {
    composite_playback_url: `http://${host}:${port}/costream/${sessionId}/index.m3u8`,
    chat_room_id:           `chat-${sessionId}`,
  };
}

// ── Main service function ──────────────────────────────────────────────────────

/**
 * Process a co-stream session request.
 * Returns { data, httpStatus } — never throws for business errors (caller sends reply).
 * Does throw AppError for schema / 404 / 409 violations.
 */
async function processSession(body) {
  // ── Step 1: Schema validation (400) ────────────────────────────────────────
  const schemaErrors = [];

  if (!body.session_id || typeof body.session_id !== 'string') schemaErrors.push('session_id');
  if (!body.host_player_id || typeof body.host_player_id !== 'string') schemaErrors.push('host_player_id');

  if (!Array.isArray(body.participants) || body.participants.length === 0) {
    schemaErrors.push('participants');
  } else {
    // Must be unique strings
    const ids = body.participants;
    const hasNonString = ids.some(p => typeof p !== 'string');
    const hasDuplicate = new Set(ids).size !== ids.length;
    if (hasNonString || hasDuplicate) schemaErrors.push('participants');
  }

  if (body.simulate_host_drop !== undefined && typeof body.simulate_host_drop !== 'boolean') {
    schemaErrors.push('simulate_host_drop');
  }

  if (body.layout !== undefined) {
    if (typeof body.layout !== 'string' || !VALID_LAYOUTS.includes(body.layout)) {
      schemaErrors.push('layout');
    }
  }

  if (schemaErrors.length > 0) throwValidation(schemaErrors);

  const sessionId        = body.session_id;
  const hostPlayerId     = body.host_player_id;
  const participants     = body.participants;
  const layout           = body.layout || DEFAULT_LAYOUT;
  const simulateHostDrop = body.simulate_host_drop ?? false;

  // host_player_id must be in participants (schema-level check per spec step 1/2 boundary)
  if (!participants.includes(hostPlayerId)) {
    throwValidation(['host_player_id'], 'host_player_id must be an element of participants.');
  }

  // ── Step 2: Player existence (404) ─────────────────────────────────────────
  const allPlayerIds = [...new Set([hostPlayerId, ...participants])];
  for (const pid of allPlayerIds) {
    const player = await db('players').where({ player_id: pid }).first();
    if (!player) {
      throwNotFound('PLAYER_NOT_FOUND', `Player '${pid}' not found.`, { player_id: pid });
    }
  }

  // ── Step 3: Max capacity (409) ─────────────────────────────────────────────
  if (participants.length > MAX_PARTICIPANTS) {
    throwConflict('COSTREAM_SESSION_FULL',
      `Co-streaming supports at most ${MAX_PARTICIPANTS} participants.`,
      { max: MAX_PARTICIPANTS, received: participants.length });
  }

  // ── Step 4: Layout capacity vs participant count BEFORE host drop (400) ────
  // Decision: use original participants.length (before simulated drop).
  // See TRACEABILITY.md for rationale.
  const effectiveCount = participants.length;
  if (layout === 'solo' && effectiveCount > 1) {
    throwValidation(['layout'],
      `Layout 'solo' supports at most 1 participant; got ${effectiveCount}.`);
  }
  if (layout === 'grid_2' && effectiveCount > 2) {
    throwValidation(['layout'],
      `Layout 'grid_2' supports at most 2 participants; got ${effectiveCount}.`);
  }

  // ── Idempotency check: same session_id already in DB ───────────────────────
  const existing = await db('costream_sessions').where({ session_id: sessionId }).first();
  if (existing) {
    // Always return stored result (200) — spec says idempotent replay returns 200
    const activeParticipants = typeof existing.active_participants === 'string'
      ? JSON.parse(existing.active_participants)
      : existing.active_participants;

    const urls       = buildUrls(sessionId);
    const sigPayload = buildSigPayload(
      sessionId, existing.status, existing.active_host,
      existing.handoff_occurred, existing.layout, existing.participant_count
    );
    const signature  = sign_day2(sessionId, sigPayload);

    return {
      httpStatus: 200,
      data: {
        session_id:             sessionId,
        status:                 existing.status,
        active_host:            existing.active_host,
        handoff_occurred:       Boolean(existing.handoff_occurred),
        participant_count:      existing.participant_count,
        active_participants:    activeParticipants,
        layout:                 existing.layout,
        composite_playback_url: urls.composite_playback_url,
        chat_room_id:           urls.chat_room_id,
        signature,
      },
    };
  }

  // ── Step 5: Deterministic host-drop handoff ─────────────────────────────────
  let activeHost, handoffOccurred, activeParticipants, participantCount, status;

  if (!simulateHostDrop) {
    activeHost         = hostPlayerId;
    handoffOccurred    = false;
    activeParticipants = [...participants];
    participantCount   = participants.length;
    status             = 'active';

  } else if (participants.length >= 2) {
    // Remove host from active list; next participant in array order becomes host
    const remaining    = participants.filter(p => p !== hostPlayerId);
    activeHost         = remaining[0];
    handoffOccurred    = true;
    activeParticipants = remaining;
    participantCount   = remaining.length;
    status             = 'active';

  } else {
    // Sole host dropped — session terminates
    activeHost         = null;
    handoffOccurred    = false;
    activeParticipants = [];
    participantCount   = 0;
    status             = 'terminated';
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  const hash = requestHash(body);
  await db('costream_sessions').insert({
    session_id:          sessionId,
    status,
    active_host:         activeHost,
    handoff_occurred:    handoffOccurred,
    participant_count:   participantCount,
    active_participants: JSON.stringify(activeParticipants),
    layout,
    request_hash:        hash,
  });

  // ── Build response ─────────────────────────────────────────────────────────
  const urls       = buildUrls(sessionId);
  const sigPayload = buildSigPayload(sessionId, status, activeHost, handoffOccurred, layout, participantCount);
  const signature  = sign_day2(sessionId, sigPayload);

  return {
    httpStatus: 201,
    data: {
      session_id:             sessionId,
      status,
      active_host:            activeHost,
      handoff_occurred:       handoffOccurred,
      participant_count:      participantCount,
      active_participants:    activeParticipants,
      layout,
      composite_playback_url: urls.composite_playback_url,
      chat_room_id:           urls.chat_room_id,
      signature,
    },
  };
}

module.exports = { processSession, buildSigPayload, buildUrls, requestHash };
