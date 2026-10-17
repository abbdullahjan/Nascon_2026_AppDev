'use strict';

const checkoutService   = require('../services/checkoutService');
const inventoryService  = require('../services/inventoryService');
const { sendError, AppError } = require('../utils/errors');

async function checkoutRoutes(fastify) {
  fastify.post('/checkout', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });
    try {
      const result = await checkoutService.checkout(body);
      return reply.status(result._isReplay ? 200 : 201).send(result.data);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({ error: { code: err.errorCode, message: err.message, details: err.details } });
      }
      throw err;
    }
  });

  fastify.get('/inventory/:variant_id', async (request, reply) => {
    try {
      const { variant_id } = request.params;
      const result = await inventoryService.getInventory(variant_id);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({ error: { code: err.errorCode, message: err.message, details: err.details } });
      }
      throw err;
    }
  });
}

module.exports = checkoutRoutes;
