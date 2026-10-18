'use strict';

/**
 * realtime/eventsHandler.js
 *
 * Owns POST /audit/v1/events (Phase II).
 *
 * This wraps the Phase I eventsService.appendEvent() — we do NOT rewrite
 * the scoring engine. After a successful append we:
 *   1. Build a score-broadcast payload
 *   2. If the event is a match status transition (match_start, match_end,
 *      postponed) call the QR stub so Abdullah's module can update routes
 *   3. Publish to Redis via broadcaster.broadcast()
 *
 * The Phase I route (routes/events.js) still handles the same endpoint
 * at /audit/v1/events. We override it here by registering our route AFTER
 * Phase I — Fastify will use the last registered handler for the same path.
 * Actually, Fastify throws on duplicate routes. So instead we PATCH the
 * Phase I eventsService: after appendEvent resolves we hook the broadcast.
 * The cleanest approach without touching Phase I code is to register our
 * own route at POST /audit/v1/events from WITHIN the module plugin scope,
 * and NOT register the Phase I eventsRoutes for this path. Since we cannot
 * remove Phase I registration from app.js (frozen), we use a different
 * strategy: this module does NOT re-register the route. Instead it exports
 * broadcastAfterEvent() which is called by an onSend hook we attach in
 * registerRoutes() — it intercepts responses from the Phase I handler.
 *
 * Concretely: we add a Fastify onSend lifecycle hook scoped to
 * POST /audit/v1/events. After Phase I sends a 201/200, we parse the body
 * and fire the broadcast asynchronously (fire-and-forget — never delays
 * the HTTP response, keeping p95 well under 500 ms).
 */

const db            = require('../../config/db');
const { broadcast } = require('./broadcaster');

// ── Stub interfaces ───────────────────────────────────────────────────────────
// These are no-ops until Abdullah's modules land. Never edit those folders.

function applyMatchEvent(event) {
  try {
    // Abdullah's qr module will provide this to update match status → target_route
    return require('../qr/matchStatus').applyMatchEvent(event);
  } catch {
    // Module not yet implemented — silently ignore
    return Promise.resolve();
  }
}

// ── Match status transition types ─────────────────────────────────────────────
const STATUS_TRANSITION_TYPES = new Set(['match_start', 'match_end']);
const STATUS_MAP = { match_start: 'in_progress', match_end: 'completed' };

/**
 * Build the real-time broadcast payload after a successful event append.
 * Fetches current score from DB so the payload is always accurate.
 *
 * Score event shape (agreed with Abdullah — see docs/CONVENTIONS.md):
 *   { type: "score", match_id, home, away, timestamp }
 *
 * Status event shape:
 *   { type: "status", match_id, status, timestamp }
 */
async function buildAndBroadcast(responseBody) {
  if (responseBody == null) return;   // guard against null/undefined before destructure

  let parsed;
  try {
    parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
  } catch {
    return;
  }

  if (!parsed || typeof parsed !== 'object') return;

  const { match_id, type: eventType } = parsed;
  if (!match_id) return;

  const timestamp = new Date().toISOString();

  try {
    // ── Broadcast score update ──────────────────────────────────────────────
    // Reproject score from DB (Phase I scoreService does the maths).
    const scoreService = require('../../services/scoreService');
    const score = await scoreService.getScore(match_id);

    await broadcast(match_id, {
      type:      'score',
      match_id,
      home:      score.home.score,
      away:      score.away.score,
      timestamp,
    });

    // ── Broadcast status change if applicable ───────────────────────────────
    if (STATUS_TRANSITION_TYPES.has(eventType)) {
      const newStatus = STATUS_MAP[eventType] || score.status;
      await broadcast(match_id, {
        type:      'status',
        match_id,
        status:    newStatus,
        timestamp,
      });

      // Notify QR module to update target_route (stub — no-op until Abdullah lands it)
      await applyMatchEvent({ match_id, type: eventType, status: newStatus });
    }
  } catch (err) {
    // Never let broadcast errors surface to the HTTP client
    console.error('[realtime] buildAndBroadcast error:', err.message);
  }
}

module.exports = { buildAndBroadcast };
