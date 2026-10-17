'use strict';

const resetService = require('../services/resetService');

// POST /audit/v1/reset
// Wipes all state and re-seeds baseline data. Must be repeatable and leave identical state every time.
async function resetRoutes(fastify) {
  fastify.post('/reset', async (request, reply) => {
    const body   = request.body || {};
    const seed   = body.seed  ?? 42;
    const stock  = body.stock ?? { 'var-jersey-001-M': 1, 'var-jersey-001-L': 5 };

    const result = await resetService.reset({ seed, stock });
    return reply.status(200).send(result);
  });
}

module.exports = resetRoutes;
