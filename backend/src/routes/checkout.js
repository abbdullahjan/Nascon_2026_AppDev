'use strict';

const checkoutService   = require('../services/checkoutService');
const inventoryService  = require('../services/inventoryService');
const { sendError }      = require('../utils/errors');

// POST /audit/v1/checkout
// GET  /audit/v1/inventory/:variant_id
async function checkoutRoutes(fastify) {

  // Concurrency-safe purchase + signed PDF receipt
  fastify.post('/checkout', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    const result = await checkoutService.checkout(body);
    return reply.status(result._isReplay ? 200 : 201).send(result.data);
  });

  // Get current stock of a variant
  fastify.get('/inventory/:variant_id', async (request, reply) => {
    const { variant_id } = request.params;
    const result = await inventoryService.getInventory(variant_id);
    return reply.status(200).send(result);
  });
}

module.exports = checkoutRoutes;
