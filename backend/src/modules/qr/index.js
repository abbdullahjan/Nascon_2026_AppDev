'use strict';

/**
 * Module: qr
 * Owner: Person A
 * Handles: FR-4.1 Dynamic Cryptographic QR Deep-Linking
 * Audit endpoints:
 *   GET  /audit/v1/qr/:entity_id
 *   GET  /audit/v1/qr/:entity_id/export.:fmt
 *   GET  /q/:short_code   (public redirect)
 */

async function registerRoutes(app) {
  // TODO: implement QR metadata, export, and short-link redirect routes (Section 5.6)
}

async function reset(trx) {
  // TODO: truncate qr_mappings, qr_scan_events tables when created
}

async function seed(trx) {
  // Seed spec 5.2: QR mappings for match-m1, player-alpha-1, club-alpha-1
  // Implemented in resetService Phase II seed block (Module 0).
  // Full QR seed goes here once the qr migration exists.
}

module.exports = { registerRoutes, reset, seed };
