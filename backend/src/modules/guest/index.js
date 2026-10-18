'use strict';

/**
 * Module: guest
 * Owner: Person A
 * Handles: FR-4.2 Zero-Account Guest Experience, FR-4.3 Write-Only Boundary,
 *          FR-4.4 Progressive Registration & Atomic Cart Merge
 * Audit endpoints: POST /audit/v1/guest/cart-merge
 */

async function registerRoutes(app) {
  // TODO: implement cart-merge route (Section 5.7)
}

async function reset(trx) {
  // TODO: truncate guest_tokens, guest_carts tables when created
}

async function seed(trx) {
  // Seed spec 5.2: guest_anon_tok_7721 (unmerged, read-only)
  // and empty persistent cart for player-alpha-1
  // Implemented in resetService Phase II seed block (Module 0).
  // Full guest seed goes here once the guest migration exists.
}

module.exports = { registerRoutes, reset, seed };
