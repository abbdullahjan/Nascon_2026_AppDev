'use strict';

/**
 * realtime/broadcaster.js
 *
 * Two responsibilities:
 *   1. PUBLISH  — eventsHandler calls broadcast(matchId, event) after a
 *                 successful event append. It publishes to Redis channel
 *                 `match:{matchId}` so every API instance gets the message.
 *
 *   2. SUBSCRIBE — a single dedicated subscriber connection listens to
 *                  `match:*` and fans the message out to all local WS and
 *                  SSE clients registered in the store.
 *
 * Pattern-subscribe (`psubscribe`) means we only need one subscription
 * regardless of how many matches are active. The Redis subscriber is a
 * separate ioredis connection (ioredis requires a dedicated client while
 * in subscribe mode).
 *
 * Score event JSON shape (agreed with Abdullah, documented in CONVENTIONS.md):
 *   { type: "score", match_id, home, away, timestamp }
 *
 * The same envelope is also used for match status transitions:
 *   { type: "status", match_id, status, timestamp }
 */

const Redis  = require('ioredis');
const store  = require('./store');

// ── Publisher — reuse the main redis client ───────────────────────────────────
const publisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (t) => Math.min(t * 100, 3000),
  lazyConnect: true,
});
publisher.on('error', (err) => console.error('[realtime] publisher error:', err.message));

// ── Subscriber — dedicated connection (psubscribe locks the connection) ───────
const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (t) => Math.min(t * 100, 3000),
  lazyConnect: true,
});
subscriber.on('error', (err) => console.error('[realtime] subscriber error:', err.message));

let _subscribed = false;

/**
 * Start the pattern subscription. Called once during registerRoutes().
 * Safe to call multiple times — only subscribes once.
 */
async function startSubscriber() {
  if (_subscribed) return;
  _subscribed = true;

  await subscriber.connect();
  await subscriber.psubscribe('match:*');

  subscriber.on('pmessage', (_pattern, channel, rawMessage) => {
    // channel = "match:{matchId}"
    const matchId = channel.slice(6); // strip "match:"
    let msg;
    try {
      msg = JSON.parse(rawMessage);
    } catch {
      return; // malformed — ignore
    }

    const json = JSON.stringify(msg);

    // ── Fan-out to WebSocket clients ────────────────────────────────────────
    for (const ws of store.getWsClients(matchId)) {
      try {
        if (ws.readyState === 1 /* OPEN */) ws.send(json);
      } catch (e) {
        // Stale socket — will be cleaned up on 'close' event
      }
    }

    // ── Fan-out to SSE clients ──────────────────────────────────────────────
    for (const reply of store.getSseClients(matchId)) {
      try {
        reply.raw.write(`data: ${json}\n\n`);
      } catch (e) {
        // Client disconnected — will be cleaned up on 'close' event
      }
    }
  });
}

/**
 * Publish a realtime event for a match.
 * Called by eventsHandler after a successful DB write.
 *
 * @param {string} matchId
 * @param {object} payload  — { type, match_id, home, away, timestamp } or status variant
 */
async function broadcast(matchId, payload) {
  try {
    await publisher.publish(`match:${matchId}`, JSON.stringify(payload));
  } catch (err) {
    // Non-fatal — log and continue. Event is already persisted in DB.
    console.error('[realtime] broadcast error:', err.message);
  }
}

/**
 * Graceful shutdown — called on process exit.
 */
async function shutdown() {
  try {
    await subscriber.punsubscribe('match:*');
    subscriber.disconnect();
    publisher.disconnect();
  } catch { /* ignore */ }
}

module.exports = { broadcast, startSubscriber, shutdown };
