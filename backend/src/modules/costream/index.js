'use strict';

/**
 * Module: costream
 * Owner: Ahmed (Person B)
 *
 * Routes registered:
 *   POST /audit/v1/costream/session  — Section 5.5
 */

const { processSession } = require('./sessionService');
const { AppError }       = require('../../shared');
const db                 = require('../../config/db');

// ─────────────────────────────────────────────────────────────────────────────
async function registerRoutes(app) {

  app.post('/audit/v1/costream/session', async (request, reply) => {
    const body = request.body || {};

    try {
      const { data, httpStatus } = await processSession(body);
      return reply.status(httpStatus).send(data);
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

// ─────────────────────────────────────────────────────────────────────────────
async function reset(trx) {
  await trx('costream_sessions').truncate();
}

async function seed(trx) {
  // No baseline co-stream sessions required.
}

module.exports = { registerRoutes, reset, seed };
