'use strict';

const sportsService = require('../services/sportsService');
const { sendError }  = require('../utils/errors');

// POST /audit/v1/sports
// Creates a new sport purely from JSON config data.
async function sportsRoutes(fastify) {
  fastify.post('/sports', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    const result = await sportsService.createSport(body);
    return reply.status(201).send(result);
  });
}

module.exports = sportsRoutes;
