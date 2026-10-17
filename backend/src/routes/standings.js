'use strict';

const standingsService = require('../services/standingsService');
const { sendError }     = require('../utils/errors');

// GET /audit/v1/standings/:league_id
// Recomputed from scratch from the event logs on every call.
async function standingsRoutes(fastify) {
  fastify.get('/standings/:league_id', async (request, reply) => {
    const { league_id } = request.params;
    const result = await standingsService.getStandings(league_id);
    return reply.status(200).send(result);
  });
}

module.exports = standingsRoutes;
