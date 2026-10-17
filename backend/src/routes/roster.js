'use strict';

const rosterService = require('../services/rosterService');
const { sendError }  = require('../utils/errors');

// POST /audit/v1/roster/setup
// POST /audit/v1/roster/transfer
// GET  /audit/v1/roster/history/:player_id
async function rosterRoutes(fastify) {

  // Build a roster scenario
  fastify.post('/roster/setup', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    const result = await rosterService.setup(body);
    return reply.status(201).send(result);
  });

  // Transfer / loan / release a player
  fastify.post('/roster/transfer', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    const result = await rosterService.transfer(body);
    return reply.status(result._isReplay ? 200 : 201).send(result.data);
  });

  // Get immutable audit trail for a player
  fastify.get('/roster/history/:player_id', async (request, reply) => {
    const { player_id } = request.params;
    const { as_of }     = request.query;

    const result = await rosterService.getHistory(player_id, as_of);
    return reply.status(200).send(result);
  });
}

module.exports = rosterRoutes;
