'use strict';

/**
 * Module: streaming
 * Owner: Ahmed (Person B)
 *
 * Routes registered:
 *   POST /audit/v1/stream/key           — generate / rotate / revoke (Section 5.4)
 *   POST /internal/mediamtx/auth        — MediaMTX external auth hook (FR-3.2)
 *
 * Validation order (spec rule): 400 → 404 → 403 → 409
 */

const db                             = require('../../config/db');
const { Validator, throwNotFound,
        throwConflict, AppError }    = require('../../shared');
const { generate, rotate, revoke }   = require('./keyService');
const { makeAuthHandler }            = require('./mediamtx');

// ─────────────────────────────────────────────────────────────────────────────
async function registerRoutes(app) {

  // ── POST /audit/v1/stream/key ───────────────────────────────────────────────
  app.post('/audit/v1/stream/key', async (request, reply) => {
    const body = request.body || {};

    // ── Step 1: Schema validation (400) ────────────────────────────────────
    const v = new Validator(body);
    v.require('action',    'string', { enum: ['generate', 'rotate', 'revoke'] });
    v.require('player_id', 'string');
    v.optional('label',             'string', { minLen: 1, maxLen: 64 });
    v.optional('stream_key_override', 'string');
    v.throw();

    // Validate stream_key_override format if provided
    if (body.stream_key_override !== undefined &&
        !/^sk_live_[a-f0-9]{16}$/.test(body.stream_key_override)) {
      return reply.status(400).send({
        error: {
          code:    'VALIDATION_ERROR',
          message: 'stream_key_override must match ^sk_live_[a-f0-9]{16}$',
          details: { fields: ['stream_key_override'] },
        },
      });
    }

    const { action, player_id, label, stream_key_override } = body;

    // ── Step 2: Player existence (404) ─────────────────────────────────────
    const player = await db('players').where({ player_id }).first();
    if (!player) {
      throwNotFound('PLAYER_NOT_FOUND', `Player '${player_id}' not found.`, { player_id });
    }

    // ── Step 3: Action-specific business logic ──────────────────────────────
    try {
      let result;
      if (action === 'generate') {
        result = await generate({ playerId: player_id, label, streamKeyOverride: stream_key_override });
      } else if (action === 'rotate') {
        result = await rotate({ playerId: player_id, label, streamKeyOverride: stream_key_override });
      } else {
        // revoke
        result = await revoke({ playerId: player_id });
      }

      const { _httpStatus, ...responseBody } = result;
      return reply.status(_httpStatus).send(responseBody);

    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({
          error: { code: err.errorCode, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  });

  // ── POST /internal/mediamtx/auth ───────────────────────────────────────────
  // Not an audit route — internal only, not rate-limited, not guest-guarded.
  app.post('/internal/mediamtx/auth', makeAuthHandler());
}

// ─────────────────────────────────────────────────────────────────────────────
async function reset(trx) {
  // Truncate stream_keys — safe because migration 100 already created it.
  await trx('stream_keys').truncate();
}

async function seed(trx) {
  // No baseline stream keys required — generated on demand.
}

module.exports = { registerRoutes, reset, seed };
