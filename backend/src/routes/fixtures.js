'use strict';

const fixturesService = require('../services/fixturesService');
const { sendError, AppError } = require('../utils/errors');

// POST /audit/v1/fixtures
// Pure computation — generates schedules/brackets. Stores nothing in DB.
// Formats: round_robin | swiss | single_elim | double_elim
async function fixturesRoutes(fastify) {
  fastify.post('/fixtures', async (request, reply) => {
    const body = request.body;

    if (!body || !body.format) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'format is required.', { fields: ['format'] });
    }

    try {
      const result = await fixturesService.generate(body);
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

module.exports = fixturesRoutes;
