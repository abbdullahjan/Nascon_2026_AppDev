'use strict';

const { rateLimitHook } = require('../middleware/rateLimit');

// GET /api/v1/ping
// Rate-limited: 100 req / 10s per client IP.
// /audit/v1/* and /health are exempt — only this prefix is limited.
async function pingRoutes(fastify) {
  fastify.get('/ping', { preHandler: rateLimitHook() }, async (request, reply) => {
    return reply.status(200).send({ pong: true });
  });
}

module.exports = pingRoutes;
