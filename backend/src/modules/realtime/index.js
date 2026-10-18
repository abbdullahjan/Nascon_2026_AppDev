'use strict';

/**
 * Module: realtime
 * Owner: Person B
 * Handles: FR-5.2 Notification Bus & Dead-Letter Queue, NFR-1 WebSocket/SSE
 * Provides: WebSocket hub at ws://localhost:8080/ws/matches/:match_id
 *           SSE at GET /api/v1/matches/:match_id/stream
 * Prometheus metrics: nascon_active_ws_connections
 */

async function registerRoutes(app) {
  // TODO: implement WebSocket/SSE score broadcast and notification bus (Section NFR-1)
}

async function reset(trx) {
  // TODO: flush in-memory WebSocket state, reset DLQ counters
}

async function seed(trx) {
  // No DB seed required — realtime state is ephemeral.
}

module.exports = { registerRoutes, reset, seed };
