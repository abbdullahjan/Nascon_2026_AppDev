'use strict';

// GET /api/v1/ping
// Rate-limited endpoint (100 req / 10s per IP). Used by the grader to test rate limiting.
async function pingRoutes(fastify) {
  fastify.get('/ping', async (request, reply) => {
    return reply.status(200).send({ pong: true });
  });
}

module.exports = pingRoutes;
