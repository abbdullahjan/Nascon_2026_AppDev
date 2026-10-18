'use strict';

const db            = require('../config/db');
const rosterService = require('../services/rosterService');
const { sendError, AppError } = require('../utils/errors');

/**
 * /api/v1/players and /api/v1/roster routes
 * Manages player profiles, career history audit trails, and transfers.
 */
async function playersRoutes(fastify) {
  // GET /api/v1/players — list players
  fastify.get('/players', async (request, reply) => {
    const { tenant_id, club_id } = request.query || {};

    let query = db('players').select('*');
    if (tenant_id) query = query.where({ tenant_id });
    if (club_id)   query = query.where({ club_id });

    const players = await query.orderBy('name', 'asc');
    return reply.status(200).send({ players });
  });

  // GET /api/v1/players/:player_id — player profile + history
  fastify.get('/players/:player_id', async (request, reply) => {
    const { player_id } = request.params;
    const { as_of } = request.query || {};

    const player = await db('players').where({ player_id }).first();
    if (!player) {
      return sendError(reply, 404, 'PLAYER_NOT_FOUND', `Player '${player_id}' not found.`, {});
    }

    let history = { current_squad_id: null, history: [] };
    try {
      history = await rosterService.getHistory(player_id, as_of);
    } catch (err) {
      // If rosterService throws PLAYER_NOT_FOUND, fallback gracefully
      if (err instanceof AppError && err.errorCode !== 'PLAYER_NOT_FOUND') {
        throw err;
      }
    }

    const registration = await db('player_registrations').where({ player_id }).first();
    const club = player.club_id ? await db('clubs').where({ club_id: player.club_id }).first() : null;

    return reply.status(200).send({
      player: {
        player_id:        player.player_id,
        name:             player.name,
        tenant_id:        player.tenant_id,
        club_id:          player.club_id,
        club_name:        club ? club.name : null,
        current_squad_id: history.current_squad_id || registration?.squad_id || null,
        role:             registration?.role || 'starter',
        position:         registration?.position || 'Player',
        history:          history.history || [],
        created_at:       player.created_at,
      },
    });
  });

  // POST /api/v1/roster/transfer — transfer, loan, or release player
  fastify.post('/roster/transfer', async (request, reply) => {
    const body = request.body;
    if (!body) return sendError(reply, 400, 'VALIDATION_ERROR', 'Request body is required.', { fields: [] });

    try {
      const result = await rosterService.transfer(body);
      return reply.status(result._isReplay ? 200 : 201).send(result.data);
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

module.exports = playersRoutes;
