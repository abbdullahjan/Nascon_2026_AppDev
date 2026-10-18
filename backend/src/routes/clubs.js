'use strict';

const db            = require('../config/db');
const { sendError } = require('../utils/errors');

/**
 * /api/v1/clubs routes
 * Exposes club profiles, rosters, venues, and colors for the mobile app.
 */
async function clubsRoutes(fastify) {
  // GET /api/v1/clubs — list clubs, optionally filtered by tenant_id
  fastify.get('/clubs', async (request, reply) => {
    const { tenant_id } = request.query || {};

    let query = db('clubs').select('*');
    if (tenant_id) {
      query = query.where({ tenant_id });
    }

    const rows = await query;
    const clubs = rows.map((club) => {
      let meta = {};
      try {
        meta = typeof club.meta === 'string' ? JSON.parse(club.meta) : (club.meta || {});
      } catch (e) {
        meta = {};
      }
      return {
        club_id:    club.club_id,
        tenant_id:  club.tenant_id,
        name:       club.name,
        meta: {
          venue:           meta.venue || 'National Stadium',
          city:            meta.city || 'Islamabad',
          primary_color:   meta.primary_color || '#1565C0',
          secondary_color: meta.secondary_color || '#FFB300',
          logo_url:        meta.logo_url || '',
          ...meta,
        },
        created_at: club.created_at,
      };
    });

    return reply.status(200).send({ clubs });
  });

  // GET /api/v1/clubs/:club_id — single club profile
  fastify.get('/clubs/:club_id', async (request, reply) => {
    const { club_id } = request.params;

    const club = await db('clubs').where({ club_id }).first();
    if (!club) {
      return sendError(reply, 404, 'CLUB_NOT_FOUND', `Club '${club_id}' not found.`, {});
    }

    let meta = {};
    try {
      meta = typeof club.meta === 'string' ? JSON.parse(club.meta) : (club.meta || {});
    } catch (e) {
      meta = {};
    }

    // Fetch squad counts and player counts
    const squads = await db('squads').where({ club_id });
    const squadIds = squads.map(s => s.squad_id);

    let playersCount = 0;
    if (squadIds.length > 0) {
      const regCount = await db('player_registrations')
        .whereIn('squad_id', squadIds)
        .count('player_id as cnt')
        .first();
      playersCount = parseInt(regCount?.cnt || 0, 10);
    } else {
      const pCount = await db('players')
        .where({ club_id })
        .count('player_id as cnt')
        .first();
      playersCount = parseInt(pCount?.cnt || 0, 10);
    }

    return reply.status(200).send({
      club: {
        club_id:    club.club_id,
        tenant_id:  club.tenant_id,
        name:       club.name,
        meta: {
          venue:           meta.venue || 'National Stadium',
          city:            meta.city || 'Islamabad',
          primary_color:   meta.primary_color || '#1565C0',
          secondary_color: meta.secondary_color || '#FFB300',
          logo_url:        meta.logo_url || '',
          ...meta,
        },
        squads_count:  squads.length,
        players_count: playersCount,
        created_at:    club.created_at,
      },
    });
  });

  // GET /api/v1/clubs/:club_id/roster — squads and players in this club
  fastify.get('/clubs/:club_id/roster', async (request, reply) => {
    const { club_id } = request.params;

    const club = await db('clubs').where({ club_id }).first();
    if (!club) {
      return sendError(reply, 404, 'CLUB_NOT_FOUND', `Club '${club_id}' not found.`, {});
    }

    // Squads belonging to this club
    const squads = await db('squads').where({ club_id });
    const squadIds = squads.map(s => s.squad_id);

    // Players directly linked by club_id or registered in one of the club squads
    let registrations = [];
    if (squadIds.length > 0) {
      registrations = await db('player_registrations')
        .whereIn('squad_id', squadIds)
        .join('players', 'player_registrations.player_id', '=', 'players.player_id')
        .select(
          'players.player_id',
          'players.name',
          'players.tenant_id',
          'players.club_id',
          'player_registrations.squad_id',
          'player_registrations.league_id',
          'player_registrations.role',
          'player_registrations.position',
          'player_registrations.registration_type',
          'player_registrations.loan_end_date'
        );
    }

    // Also get players with players.club_id = club_id not yet in registrations
    const directPlayers = await db('players').where({ club_id });
    const registeredIds = new Set(registrations.map(r => r.player_id));

    const players = [
      ...registrations.map(r => ({
        player_id:         r.player_id,
        name:              r.name,
        tenant_id:         r.tenant_id,
        club_id:           r.club_id || club_id,
        squad_id:          r.squad_id,
        league_id:         r.league_id,
        role:              r.role,
        position:          r.position || 'Player',
        registration_type: r.registration_type,
        loan_end_date:     r.loan_end_date,
      })),
      ...directPlayers
        .filter(p => !registeredIds.has(p.player_id))
        .map(p => ({
          player_id:         p.player_id,
          name:              p.name,
          tenant_id:         p.tenant_id,
          club_id:           p.club_id || club_id,
          squad_id:          null,
          league_id:         null,
          role:              'starter',
          position:          'Player',
          registration_type: 'transfer',
          loan_end_date:     null,
        })),
    ];

    return reply.status(200).send({
      club_id,
      club_name: club.name,
      squads: squads.map(s => ({ squad_id: s.squad_id, name: s.name, league_id: s.league_id })),
      players,
    });
  });
}

module.exports = clubsRoutes;
