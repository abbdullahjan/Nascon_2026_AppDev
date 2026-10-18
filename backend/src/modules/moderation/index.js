'use strict';

/**
 * Module: moderation
 * Owner: Person B (Ahmed)
 * Handles: FR-5.3 Automated Chat Moderation Engine, FR-5.2 DLQ
 * Audit endpoints: POST /audit/v1/moderation/test
 */

const { Validator } = require('../../shared');
const { processModerationTest } = require('./service');

async function registerRoutes(app) {
  // POST /audit/v1/moderation/test (Spec 5.8)
  // Exempt from rate limiting (Section 8 of docs/CONVENTIONS.md)
  app.post('/audit/v1/moderation/test', async (req, reply) => {
    const v = new Validator(req.body);
    v.require('chat_room_id', 'string');
    v.optional('incoming_messages', 'array');
    v.optional('check_dlq', 'boolean');
    v.optional('simulate_failed_notifications', 'integer', { min: 0 });
    v.throw();

    // Additional check for incoming_messages elements if present
    if (Array.isArray(req.body.incoming_messages)) {
      for (const msg of req.body.incoming_messages) {
        if (!msg || typeof msg !== 'object' || typeof msg.text !== 'string') {
          const { throwValidation } = require('../../shared');
          throwValidation(['incoming_messages'], 'Each message must have text.');
        }
      }
    }

    const result = await processModerationTest(req.body);
    return reply.status(200).send(result);
  });
}

async function reset(trx) {
  await trx('moderation_dlq').truncate();
}

async function seed(trx) {
  // No baseline seed data required for moderation module.
}

module.exports = { registerRoutes, reset, seed };
