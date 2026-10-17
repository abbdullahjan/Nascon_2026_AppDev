'use strict';

const leaguesService = require('../services/leaguesService');
const { sendError, AppError } = require('../utils/errors');

// POST /audit/v1/leagues
// Registers a league with teams, fixtures, points config, tie-break order, qualification spots.
async function leaguesRoutes(fastify) {
  fastify.post('/leagues', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    try {
      const result = await leaguesService.createLeague(body);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({
          error: { code: err.errorCode, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  });
}

module.exports = leaguesRoutes;
