'use strict';

const rosterService = require('../services/rosterService');
const { sendError, AppError } = require('../utils/errors');

// POST /audit/v1/roster/setup
// POST /audit/v1/roster/transfer
// GET  /audit/v1/roster/history/:player_id
async function rosterRoutes(fastify) {

  // Build a roster scenario
  fastify.post('/roster/setup', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    try {
      const result = await rosterService.setup(body);
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

  // Transfer / loan / release a player
  fastify.post('/roster/transfer', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    try {
      const result = await rosterService.transfer(body);
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

  // Get immutable audit trail for a player
  fastify.get('/roster/history/:player_id', async (request, reply) => {
    try {
      const { player_id } = request.params;
      const { as_of } = request.query;
      const result = await rosterService.getHistory(player_id, as_of);
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

module.exports = rosterRoutes;
