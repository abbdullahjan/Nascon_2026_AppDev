'use strict';

const eventsService = require('../services/eventsService');
const scoreService  = require('../services/scoreService');
const { sendError, AppError } = require('../utils/errors');

// POST /audit/v1/events        — append a match event (signed)
// GET  /audit/v1/score/:match_id — score projection rebuilt from the event log
async function eventsRoutes(fastify) {

  // Append a match event
  fastify.post('/events', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    try {
      const result = await eventsService.appendEvent(body);
      return reply.status(result._isReplay ? 200 : 201).send(result.data);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({
          error: { code: err.errorCode, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  });

  // Get score projection for a match
  fastify.get('/score/:match_id', async (request, reply) => {
    try {
      const { match_id } = request.params;
      const result = await scoreService.getScore(match_id);
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

module.exports = eventsRoutes;
