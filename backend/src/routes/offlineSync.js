'use strict';

const offlineSyncService = require('../services/offlineSyncService');
const { sendError }       = require('../utils/errors');

// POST /audit/v1/offline-sync
// Replays a batch of actions a mobile device queued while offline.
// Always returns HTTP 200 — per-action conflicts reported inside the response body.
async function offlineSyncRoutes(fastify) {
  fastify.post('/offline-sync', async (request, reply) => {
    const body = request.body;
    if (!body || !body.device_id || !Array.isArray(body.actions)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'device_id and actions array are required.', { fields: [] });
    }
    if (body.actions.length < 1 || body.actions.length > 100) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'actions must contain 1–100 items.', { fields: ['actions'] });
    }

    const result = await offlineSyncService.sync(body);
    return reply.status(200).send(result);
  });
}

module.exports = offlineSyncRoutes;
