'use strict';

/**
 * realtime/metricsHandler.js
 *
 * Builds the Prometheus text-format response for GET /metrics.
 *
 * Spec NFR-6 / Section 5.9 — mandatory metrics:
 *   nascon_active_ws_connections   gauge
 *   nascon_active_streams_total    gauge
 *   nascon_stream_bitrate_kbps     gauge
 *   nascon_dlq_depth               gauge
 *   nascon_qr_scans_total          counter
 *
 * Content-Type: text/plain; version=0.0.4
 *
 * nascon_qr_scans_total is read live from the DB (qr_mappings SUM)
 * so it stays accurate after a reset without a cross-module import.
 * All other metrics come from the in-memory store.
 */

const db    = require('../../config/db');
const store = require('./store');

/**
 * Format a single Prometheus metric line.
 *   # HELP <name> <help>
 *   # TYPE <name> <type>
 *   <name> <value>
 */
function metricLine(name, type, help, value) {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name} ${value}`;
}

/**
 * Build the full Prometheus exposition text.
 * Reads qr_scans_total live from DB; everything else from the store.
 */
async function buildMetricsText() {
  const m = store.getMetrics();

  // Read QR scan total from DB so it stays accurate across restarts
  let qrScansTotal = m.nascon_qr_scans_total;
  try {
    const row = await db('qr_mappings').sum('scan_count as total').first();
    qrScansTotal = row && row.total != null ? parseInt(row.total, 10) : 0;
  } catch {
    // DB not reachable (e.g. during tests) — fall back to in-memory value
  }

  const lines = [
    metricLine(
      'nascon_active_ws_connections', 'gauge',
      'Number of active WebSocket connections across all matches',
      m.nascon_active_ws_connections,
    ),
    metricLine(
      'nascon_active_streams_total', 'gauge',
      'Number of currently active live streams',
      m.nascon_active_streams_total,
    ),
    metricLine(
      'nascon_stream_bitrate_kbps', 'gauge',
      'Aggregate ingest bitrate across all active streams in kbps',
      m.nascon_stream_bitrate_kbps,
    ),
    metricLine(
      'nascon_dlq_depth', 'gauge',
      'Number of undelivered events currently in the Dead-Letter Queue',
      m.nascon_dlq_depth,
    ),
    metricLine(
      'nascon_qr_scans_total', 'counter',
      'Total number of QR code scans across all entities',
      qrScansTotal,
    ),
  ];

  return lines.join('\n') + '\n';
}

module.exports = { buildMetricsText };
