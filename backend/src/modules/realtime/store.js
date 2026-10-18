'use strict';

/**
 * realtime/store.js
 *
 * In-process registry for:
 *   - Active WebSocket connections  keyed by match_id
 *   - Active SSE response objects   keyed by match_id
 *   - Prometheus gauge/counter values
 *
 * All mutations are synchronous (Node.js single-threaded) so no locking needed.
 * The store is a singleton — required once, shared across the process.
 */

// ── WebSocket registry ────────────────────────────────────────────────────────
// Map<match_id, Set<WebSocket>>
const wsClients = new Map();

function addWsClient(matchId, ws) {
  if (!wsClients.has(matchId)) wsClients.set(matchId, new Set());
  wsClients.get(matchId).add(ws);
  _metrics.nascon_active_ws_connections++;
}

function removeWsClient(matchId, ws) {
  const set = wsClients.get(matchId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) wsClients.delete(matchId);
  _metrics.nascon_active_ws_connections = Math.max(0, _metrics.nascon_active_ws_connections - 1);
}

/** Returns a copy of the set so callers can iterate safely. */
function getWsClients(matchId) {
  return wsClients.get(matchId) ? [...wsClients.get(matchId)] : [];
}

function totalWsConnections() {
  let n = 0;
  for (const s of wsClients.values()) n += s.size;
  return n;
}

// ── SSE registry ──────────────────────────────────────────────────────────────
// Map<match_id, Set<reply>>  (Fastify reply objects with raw res kept open)
const sseClients = new Map();

function addSseClient(matchId, reply) {
  if (!sseClients.has(matchId)) sseClients.set(matchId, new Set());
  sseClients.get(matchId).add(reply);
}

function removeSseClient(matchId, reply) {
  const set = sseClients.get(matchId);
  if (!set) return;
  set.delete(reply);
  if (set.size === 0) sseClients.delete(matchId);
}

function getSseClients(matchId) {
  return sseClients.get(matchId) ? [...sseClients.get(matchId)] : [];
}

// ── Prometheus metrics ────────────────────────────────────────────────────────
// These are the 5 gauges/counters mandated by spec NFR-6 / Section 5.9.
// nascon_stream_bitrate_kbps and nascon_active_streams_total are updated by
// the streaming module via setMetric(); the rest are owned here.
const _metrics = {
  nascon_active_ws_connections: 0,   // updated by add/removeWsClient
  nascon_active_streams_total:  0,   // updated by streaming module
  nascon_stream_bitrate_kbps:   0,   // updated by streaming module
  nascon_dlq_depth:             0,   // updated by moderation module
  nascon_qr_scans_total:        0,   // updated by qr module
};

/**
 * Allow other modules to push metric updates without importing the full store.
 * Usage: store.setMetric('nascon_active_streams_total', 3)
 */
function setMetric(name, value) {
  if (Object.prototype.hasOwnProperty.call(_metrics, name)) {
    _metrics[name] = value;
  }
}

function incMetric(name, delta = 1) {
  if (Object.prototype.hasOwnProperty.call(_metrics, name)) {
    _metrics[name] += delta;
  }
}

function getMetrics() {
  // Always recompute WS count from actual registry to stay accurate
  return {
    ..._metrics,
    nascon_active_ws_connections: totalWsConnections(),
  };
}

/** Full reset — called by module reset() on POST /audit/v1/reset. */
function resetStore() {
  wsClients.clear();
  sseClients.clear();
  for (const k of Object.keys(_metrics)) _metrics[k] = 0;
}

module.exports = {
  addWsClient, removeWsClient, getWsClients, totalWsConnections,
  addSseClient, removeSseClient, getSseClients,
  setMetric, incMetric, getMetrics,
  resetStore,
};
