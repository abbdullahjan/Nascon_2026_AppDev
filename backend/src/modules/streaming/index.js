'use strict';

/**
 * Module: streaming
 * Owner: Ahmed (Person B)
 *
 * Routes registered:
 *   POST /audit/v1/stream/key           — generate / rotate / revoke (Section 5.4)
 *   POST /internal/mediamtx/auth        — MediaMTX external auth hook (FR-3.2)
 *   POST /internal/mediamtx/recording   — MediaMTX on-record-complete webhook (FR-3.2)
 *   GET  /audit/v1/stream/:stream_key/vods — list VOD recordings for a stream key
 *
 * Validation order (spec rule): 400 → 404 → 403 → 409
 */

const db                             = require('../../config/db');
const { Validator, throwNotFound,
        AppError }                   = require('../../shared');
const { generate, rotate, revoke }   = require('./keyService');
const { makeAuthHandler }            = require('./mediamtx');
const { processRecording, listVods } = require('./recorder');

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

  // ── POST /internal/mediamtx/recording ──────────────────────────────────────
  // MediaMTX calls this when a recording segment completes (onRecordSegmentComplete).
  // Body: { stream_key, file_path, duration?, size? }
  app.post('/internal/mediamtx/recording', async (request, reply) => {
    const body = request.body || {};
    try {
      const result = await processRecording(body);
      return reply.status(202).send(result); // 202 Accepted — upload is async
    } catch (err) {
      if (err.statusCode === 400) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: err.message, details: {} },
        });
      }
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({
          error: { code: err.errorCode, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  });

  // ── GET /audit/v1/stream/:stream_key/vods ───────────────────────────────────
  // List completed VOD recordings for a given stream key.
  app.get('/audit/v1/stream/:stream_key/vods', async (request, reply) => {
    const { stream_key } = request.params;
    const vods = await listVods(stream_key);
    return reply.status(200).send({ stream_key, vods });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
async function reset(trx) {
  // Truncate stream_keys and vod_recordings (dependency order — vods first).
  await trx('vod_recordings').truncate();
  await trx('stream_keys').truncate();
}

async function seed(trx) {
  // No baseline stream keys required — generated on demand.
}

module.exports = { registerRoutes, reset, seed };
