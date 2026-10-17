'use strict';

const fixturesService = require('../services/fixturesService');
const { sendError }    = require('../utils/errors');

// POST /audit/v1/fixtures
// Pure computation — generates schedules/brackets. Stores nothing.
// Formats: round_robin | swiss | single_elim | double_elim
async function fixturesRoutes(fastify) {
  fastify.post('/fixtures', async (request, reply) => {
    const body = request.body;
    if (!body || !body.format) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'format is required.', { fields: ['format'] });
    }

    const result = await fixturesService.generate(body);
    return reply.status(200).send(result);
  });
}

module.exports = fixturesRoutes;
