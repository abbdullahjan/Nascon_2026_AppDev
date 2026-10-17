'use strict';

const db = require('../config/db');

// GET /health
// Returns 200 {"status":"ok"} only when the database is reachable and baseline data is seeded.
async function healthRoutes(fastify) {
  fastify.get('/health', { config: { rateLimit: false } }, async (request, reply) => {
    try {
      await db.raw('SELECT 1');
      return reply.status(200).send({ status: 'ok' });
    } catch (err) {
      return reply.status(503).send({ status: 'unavailable', error: err.message });
    }
  });
}

module.exports = healthRoutes;
