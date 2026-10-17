'use strict';

const offlineSyncService = require('../services/offlineSyncService');
const { sendError, AppError } = require('../utils/errors');

async function offlineSyncRoutes(fastify) {
  fastify.post('/offline-sync', async (request, reply) => {
    const body = request.body;
    if (!body || !body.device_id || !Array.isArray(body.actions)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'device_id and actions array are required.', { fields: [] });
    }
    if (body.actions.length < 1 || body.actions.length > 100) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'actions must contain 1–100 items.', { fields: ['actions'] });
    }
    try {
      const result = await offlineSyncService.sync(body);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({ error: { code: err.errorCode, message: err.message, details: err.details } });
      }
      throw err;
    }
  });
}

module.exports = offlineSyncRoutes;
