'use strict';

const eventsService = require('../services/eventsService');
const scoreService  = require('../services/scoreService');
const { sendError }  = require('../utils/errors');

// POST /audit/v1/events        — append a match event (signed)
// GET  /audit/v1/score/:match_id — score projection rebuilt from the event log
async function eventsRoutes(fastify) {

  // Append a match event
  fastify.post('/events', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    const result = await eventsService.appendEvent(body);
    // 200 on idempotent replay, 201 on new event
    return reply.status(result._isReplay ? 200 : 201).send(result.data);
  });

  // Get score projection for a match
  fastify.get('/score/:match_id', async (request, reply) => {
    const { match_id } = request.params;
    const result = await scoreService.getScore(match_id);
    return reply.status(200).send(result);
  });
}

module.exports = eventsRoutes;
