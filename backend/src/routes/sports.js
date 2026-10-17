'use strict';

const sportsService  = require('../services/sportsService');
const { sendError }  = require('../utils/errors');
const { AppError }   = require('../utils/errors');

// POST /audit/v1/sports  — create a mystery sport from JSON config
// GET  /audit/v1/sports  — list all sports (for verification)
// GET  /audit/v1/sports/:sport_id — get one sport config
async function sportsRoutes(fastify) {

  // Create a new sport from pure JSON config
  fastify.post('/sports', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    try {
      const result = await sportsService.createSport(body);
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

  // List all sports
  fastify.get('/sports', async (request, reply) => {
    const sports = await sportsService.listSports();
    return reply.status(200).send({ sports });
  });

  // Get a single sport config by id
  fastify.get('/sports/:sport_id', async (request, reply) => {
    try {
      const config = await sportsService.getSport(request.params.sport_id);
      return reply.status(200).send(config);
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

module.exports = sportsRoutes;
