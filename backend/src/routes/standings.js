'use strict';

const standingsService = require('../services/standingsService');
const { AppError } = require('../utils/errors');

// GET /audit/v1/standings/:league_id
// Recomputed from scratch from the event logs on every call.
async function standingsRoutes(fastify) {
  fastify.get('/standings/:league_id', async (request, reply) => {
    try {
      const { league_id } = request.params;
      const result = await standingsService.getStandings(league_id);
      return reply.status(200).send(result);
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

module.exports = standingsRoutes;
