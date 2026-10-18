'use strict';

/**
 * streaming/mediamtx.js
 *
 * Two responsibilities:
 *
 * 1. AUTH HOOK  — POST /internal/mediamtx/auth
 *    MediaMTX calls this before allowing any RTMP/WebRTC publish or read.
 *    We look up the path (= stream_key) in our DB.  Active key → 200 OK
 *    (MediaMTX allows).  Revoked / missing → 401 (MediaMTX denies).
 *    mediamtx.yml must set:
 *      authMethod: external
 *      authHTTPAddress: http://api:8080/internal/mediamtx/auth
 *
 * 2. KICK PUBLISHER — kickPublisher(streamKey)
 *    Called by keyService on rotate/revoke to sever any live ingest within
 *    2 s (spec FR-3.2).  Uses the MediaMTX control API (port 9997 by default,
 *    configured via env var MEDIAMTX_API_URL).
 *    Fire-and-forget — caller does .catch(() => {}) so a missing media server
 *    never breaks the HTTP response.
 *
 * MediaMTX control API reference:
 *   DELETE http://{MEDIAMTX_API_URL}/v3/paths/kick/{name}
 *   name = stream_key (the RTMP path, e.g. sk_live_9f83a1b2c3d4e5f6)
 */

const { findActiveKey } = require('./keyService');

// ── Kick publisher ─────────────────────────────────────────────────────────────

/**
 * Sever an active RTMP/WebRTC publisher by calling the MediaMTX control API.
 * Non-throwing — if the API is unreachable or the path is not live we log and
 * return silently.  The 2-second deadline is enforced via AbortSignal.timeout.
 *
 * @param {string} streamKey  e.g. "sk_live_9f83a1b2c3d4e5f6"
 */
async function kickPublisher(streamKey) {
  const baseUrl = process.env.MEDIAMTX_API_URL || 'http://mediamtx:9997';
  const url     = `${baseUrl}/v3/paths/kick/${encodeURIComponent(streamKey)}`;

  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, {
      method: 'DELETE',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok && res.status !== 404) {
      // 404 = path not currently active (no live publisher) — that's fine
      console.warn(`[streaming] kickPublisher got HTTP ${res.status} for key ${streamKey}`);
    }
  } catch (err) {
    // AbortError = timeout; ConnectionRefused = mediamtx not up — both fine
    console.warn(`[streaming] kickPublisher skipped: ${err.message}`);
  }
}

// ── Auth hook handler factory ──────────────────────────────────────────────────

/**
 * Returns a Fastify route handler for POST /internal/mediamtx/auth.
 * findActiveKey is required lazily here to break the circular dependency:
 *   keyService → mediamtx → keyService
 */
function makeAuthHandler() {
  return async function mediamtxAuthHandler(request, reply) {
    const body = request.body || {};
    const { path: streamKey, action } = body;

    // Allow all read/playback requests unconditionally
    if (action !== 'publish') {
      return reply.status(200).send({ result: 'allow' });
    }

    if (!streamKey) {
      return reply.status(401).send({ result: 'deny', reason: 'missing stream key' });
    }

    try {
      // Lazy require breaks the circular dependency
      const { findActiveKey } = require('./keyService');
      const row = await findActiveKey(streamKey);
      if (!row) {
        return reply.status(401).send({ result: 'deny', reason: 'stream key not found or revoked' });
      }
      return reply.status(200).send({ result: 'allow' });
    } catch (err) {
      console.error('[streaming] auth hook DB error:', err.message);
      // Fail open only if DB is completely unavailable — better than blocking all streams
      return reply.status(200).send({ result: 'allow' });
    }
  };
}

module.exports = { kickPublisher, makeAuthHandler };
