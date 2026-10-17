'use strict';

const db = require('../config/db');

// GET /health
// Returns 200 {"status":"ok"} only when:
//   1. The database is reachable
//   2. Baseline data is seeded (sports table has at least 1 row)
// No auth required. Not rate-limited.
async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    try {
      // Check DB connectivity
      await db.raw('SELECT 1');

      // Check baseline seeded (sports must exist)
      const row = await db('sports').count('* as cnt').first();
      if (!row || parseInt(row.cnt) === 0) {
        return reply.status(503).send({ status: 'seeding', message: 'Baseline data not yet seeded.' });
      }

      return reply.status(200).send({ status: 'ok' });
    } catch (err) {
      return reply.status(503).send({ status: 'unavailable', message: err.message });
    }
  });
}

module.exports = healthRoutes;
