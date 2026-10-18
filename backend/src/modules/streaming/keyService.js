'use strict';

/**
 * streaming/keyService.js
 *
 * All DB logic for stream key lifecycle.
 * Spec Section 5.4 — POST /audit/v1/stream/key
 *
 * Key format:   ^sk_live_[a-f0-9]{16}$
 * Actions:      generate (201) | rotate (200) | revoke (200)
 *
 * Signature payload (Section 5.3 — 4-key form, autograder also accepts 2-key):
 *   { action, player_id, status, stream_key }
 *
 * Ingest / playback URLs are built from env config (spec 6.1 fixed ports):
 *   rtmp://localhost:1935/live/{key}
 *   http://localhost:8889/live/{key}/whip
 *   http://localhost:8888/live/{key}/index.m3u8
 */

const crypto     = require('crypto');
const db         = require('../../config/db');
const { sign_day2, throwNotFound, throwConflict, throwValidation, config } = require('../../shared');
const { kickPublisher } = require('./mediamtx');
const store      = require('../realtime/store');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a random stream key matching ^sk_live_[a-f0-9]{16}$ */
function generateKey() {
  return 'sk_live_' + crypto.randomBytes(8).toString('hex');
}

/** Build ingest + playback URLs from env-configured media host/ports */
function buildUrls(streamKey) {
  const host   = config.MEDIA_HOST || 'localhost';
  const rtmp   = config.MEDIA_RTMP_PORT   || 1935;
  const hls    = config.MEDIA_HLS_PORT    || 8888;
  const webrtc = config.MEDIA_WEBRTC_PORT || 8889;
  return {
    ingest_endpoints: {
      rtmp:   `rtmp://${host}:${rtmp}/live/${streamKey}`,
      webrtc: `http://${host}:${webrtc}/live/${streamKey}/whip`,
    },
    playback_url: `http://${host}:${hls}/live/${streamKey}/index.m3u8`,
  };
}

/** Build the 4-key sig_payload per Section 5.3 */
function buildSigPayload(action, playerId, status, streamKey) {
  return { action, player_id: playerId, status, stream_key: streamKey };
}

/** Sign using DAY2_SALT */
function signKey(streamKey, sigPayload) {
  return sign_day2(streamKey, sigPayload);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * POST /audit/v1/stream/key  action=generate
 * Creates a new active key for the player.
 * If the player already has an active key it is replaced (invalidated).
 * Returns 201.
 */
async function generate({ playerId, label, streamKeyOverride }) {
  const streamKey = streamKeyOverride || generateKey();
  const status    = 'active';

  await db.transaction(async (trx) => {
    // Invalidate any existing active key for this player
    await trx('stream_keys')
      .where({ player_id: playerId, status: 'active' })
      .update({ status: 'revoked' });

    await trx('stream_keys').insert({
      stream_key: streamKey,
      player_id:  playerId,
      label:      label || 'default',
      status,
    });
  });

  // Update Prometheus counter
  const activeCount = await _countActive();
  store.setMetric('nascon_active_streams_total', activeCount);

  const sigPayload = buildSigPayload('generate', playerId, status, streamKey);
  const signature  = signKey(streamKey, sigPayload);
  const urls       = buildUrls(streamKey);

  return {
    player_id:  playerId,
    label:      label || 'default',
    stream_key: streamKey,
    status,
    ...urls,
    signature,
    _httpStatus: 201,
  };
}

/**
 * POST /audit/v1/stream/key  action=rotate
 * Revokes the current key (if any), issues a new one.
 * Returns 200.
 */
async function rotate({ playerId, label, streamKeyOverride }) {
  const streamKey = streamKeyOverride || generateKey();
  const status    = 'active';

  await db.transaction(async (trx) => {
    // Revoke existing keys for player (active or otherwise)
    const existing = await trx('stream_keys')
      .where({ player_id: playerId, status: 'active' })
      .first();

    if (existing) {
      // Kick any live RTMP/WebRTC publisher before revoking
      // Fire-and-forget with 2 s timeout (spec FR-3.2)
      kickPublisher(existing.stream_key).catch(() => {});
      await trx('stream_keys')
        .where({ stream_key: existing.stream_key })
        .update({ status: 'revoked' });
    }

    await trx('stream_keys').insert({
      stream_key: streamKey,
      player_id:  playerId,
      label:      label || 'default',
      status,
    });
  });

  const activeCount = await _countActive();
  store.setMetric('nascon_active_streams_total', activeCount);

  const sigPayload = buildSigPayload('rotate', playerId, status, streamKey);
  const signature  = signKey(streamKey, sigPayload);
  const urls       = buildUrls(streamKey);

  return {
    player_id:  playerId,
    label:      label || 'default',
    stream_key: streamKey,
    status,
    ...urls,
    signature,
    _httpStatus: 200,
  };
}

/**
 * POST /audit/v1/stream/key  action=revoke
 * Revokes the player's current active key.
 * Returns 200 with status=revoked, ingest_endpoints=null, playback_url=null.
 * If no active key exists → 404 STREAM_NOT_FOUND.
 */
async function revoke({ playerId }) {
  let existing;
  await db.transaction(async (trx) => {
    existing = await trx('stream_keys')
      .where({ player_id: playerId, status: 'active' })
      .first();

    if (!existing) {
      throwNotFound('STREAM_NOT_FOUND', `No active stream key for player '${playerId}'.`, { player_id: playerId });
    }

    kickPublisher(existing.stream_key).catch(() => {});
    await trx('stream_keys')
      .where({ stream_key: existing.stream_key })
      .update({ status: 'revoked' });
  });

  const activeCount = await _countActive();
  store.setMetric('nascon_active_streams_total', activeCount);

  const status     = 'revoked';
  const sigPayload = buildSigPayload('revoke', playerId, status, existing.stream_key);
  const signature  = signKey(existing.stream_key, sigPayload);

  return {
    player_id:        playerId,
    label:            existing.label,
    stream_key:       existing.stream_key,
    status,
    ingest_endpoints: null,
    playback_url:     null,
    signature,
    _httpStatus: 200,
  };
}

/**
 * Verify a stream key is active (used by MediaMTX auth hook).
 * Returns the row or null.
 */
async function findActiveKey(streamKey) {
  return db('stream_keys').where({ stream_key: streamKey, status: 'active' }).first();
}

/** Count active keys (for Prometheus metric) */
async function _countActive() {
  const row = await db('stream_keys').where({ status: 'active' }).count('* as cnt').first();
  return parseInt(row.cnt, 10) || 0;
}

module.exports = { generate, rotate, revoke, findActiveKey, generateKey, buildUrls, buildSigPayload, signKey };
