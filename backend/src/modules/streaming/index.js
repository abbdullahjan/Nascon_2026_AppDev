'use strict';

/**
 * Module: streaming
 * Owner: Person B
 * Handles: FR-3.2 Solo Streaming & Stream Key Lifecycle
 * Audit endpoints: POST /audit/v1/stream/key
 * Prometheus metrics: nascon_active_streams_total, nascon_stream_bitrate_kbps
 */

async function registerRoutes(app) {
  // TODO: implement stream/key generate/rotate/revoke route (Section 5.4)
}

async function reset(trx) {
  // TODO: truncate stream_keys table when created
}

async function seed(trx) {
  // No baseline stream keys required — generated on demand.
}

module.exports = { registerRoutes, reset, seed };
