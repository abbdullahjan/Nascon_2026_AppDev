'use strict';

const leaguesService = require('../services/leaguesService');
const { sendError }   = require('../utils/errors');

// POST /audit/v1/leagues
// Registers a league with teams, fixtures, points config, tie-break order, qualification spots.
async function leaguesRoutes(fastify) {
  fastify.post('/leagues', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    const result = await leaguesService.createLeague(body);
    return reply.status(201).send(result);
  });
}

module.exports = leaguesRoutes;
