'use strict';

/**
 * Module: guest
 * Owner: Person A / Ahmed (Handoff)
 * Handles: FR-4.2 Zero-Account Guest Experience, FR-4.3 Write-Only Boundary,
 *          FR-4.4 Progressive Registration & Atomic Cart Merge (Spec 5.7, 8.4)
 *          Spec 5.9 Privacy Erasure Probe
 * Audit endpoints:
 *   POST   /audit/v1/guest/cart-merge
 *   DELETE /audit/v1/privacy/user/:user_id
 */

const { processCartMerge, processPrivacyErasure } = require('./cartService');

async function registerRoutes(app) {
  // POST /audit/v1/guest/cart-merge (Spec 5.7)
  // Exempt from rate limiting
  app.post('/audit/v1/guest/cart-merge', async (req, reply) => {
    const result = await processCartMerge(req.body || {});
    return reply.status(200).send(result);
  });

  // DELETE /audit/v1/privacy/user/:user_id (Spec 5.9)
  app.delete('/audit/v1/privacy/user/:user_id', async (req, reply) => {
    const { user_id } = req.params;
    const result = await processPrivacyErasure(user_id);
    return reply.status(200).send(result);
  });
}

async function reset(trx) {
  await trx('persistent_carts').truncate();
  await trx('guest_carts').truncate();
  await trx('guest_tokens').truncate();
}

async function seed(trx) {
  // Baseline guest_tokens: guest_anon_tok_7721
  // Handled by resetService Phase II baseline seed
}

module.exports = { registerRoutes, reset, seed };
