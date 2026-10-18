'use strict';

const db               = require('../config/db');
const standingsService = require('../services/standingsService');
const { sendError, AppError } = require('../utils/errors');

/**
 * /api/v1/leagues routes
 * Exposes league details, fixtures, and standings tables for the mobile app.
 */
async function leaguesApiRoutes(fastify) {
  // GET /api/v1/leagues — list leagues
  fastify.get('/leagues', async (request, reply) => {
    const { tenant_id, sport_id } = request.query || {};

    let query = db('leagues').select('*');
    if (tenant_id) query = query.where({ tenant_id });
    if (sport_id)  query = query.where({ sport_id });

    const rows = await query.orderBy('created_at', 'desc');
    const leagues = rows.map(l => {
      let config = {};
      try {
        config = typeof l.config === 'string' ? JSON.parse(l.config) : (l.config || {});
      } catch (e) {
        config = {};
      }
      return {
        league_id:  l.league_id,
        tenant_id:  l.tenant_id,
        sport_id:   l.sport_id,
        teams:      config.teams || [],
        points:     config.points || { win: 3, draw: 1, loss: 0 },
        created_at: l.created_at,
      };
    });

    return reply.status(200).send({ leagues });
  });

  // GET /api/v1/leagues/:league_id — single league details
  fastify.get('/leagues/:league_id', async (request, reply) => {
    const { league_id } = request.params;

    const league = await db('leagues').where({ league_id }).first();
    if (!league) {
      return sendError(reply, 404, 'LEAGUE_NOT_FOUND', `League '${league_id}' not found.`, {});
    }

    let config = {};
    try {
      config = typeof league.config === 'string' ? JSON.parse(league.config) : (league.config || {});
    } catch (e) {
      config = {};
    }

    const matchCount = await db('matches').where({ league_id }).count('match_id as cnt').first();

    return reply.status(200).send({
      league: {
        league_id:     league.league_id,
        tenant_id:     league.tenant_id,
        sport_id:      league.sport_id,
        config,
        teams:         config.teams || [],
        fixtures_count: parseInt(matchCount?.cnt || 0, 10),
        created_at:    league.created_at,
      },
    });
  });

  // GET /api/v1/leagues/:league_id/standings — points table
  fastify.get('/leagues/:league_id/standings', async (request, reply) => {
    const { league_id } = request.params;

    const league = await db('leagues').where({ league_id }).first();
    if (!league) {
      return sendError(reply, 404, 'LEAGUE_NOT_FOUND', `League '${league_id}' not found.`, {});
    }

    let config = {};
    try {
      config = typeof league.config === 'string' ? JSON.parse(league.config) : (league.config || {});
    } catch (e) {
      config = {};
    }

    // If config has teams, compute via standingsService
    if (Array.isArray(config.teams) && config.teams.length > 0) {
      try {
        const standings = await standingsService.getStandings(league_id);
        return reply.status(200).send(standings);
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send({
            error: { code: err.errorCode, message: err.message, details: err.details },
          });
        }
        throw err;
      }
    }

    // Fallback: If league has matches or teams in clubs
    const matches = await db('matches').where({ league_id });
    const teamsSet = new Set();
    for (const m of matches) {
      if (m.home_team) teamsSet.add(m.home_team);
      if (m.away_team) teamsSet.add(m.away_team);
    }
    const teams = Array.from(teamsSet);

    const rows = teams.map((teamId, idx) => ({
      rank:                 idx + 1,
      team_id:              teamId,
      played:               0,
      won:                  0,
      drawn:                0,
      lost:                 0,
      points:               0,
      qualification_status: 'still_possible',
    }));

    return reply.status(200).send({
      league_id,
      sport_id:   league.sport_id,
      standings:  rows,
    });
  });

  // GET /api/v1/leagues/:league_id/fixtures — matches for this league
  fastify.get('/leagues/:league_id/fixtures', async (request, reply) => {
    const { league_id } = request.params;

    const league = await db('leagues').where({ league_id }).first();
    if (!league) {
      return sendError(reply, 404, 'LEAGUE_NOT_FOUND', `League '${league_id}' not found.`, {});
    }

    const matches = await db('matches').where({ league_id }).orderBy('created_at', 'asc');
    return reply.status(200).send({ league_id, fixtures: matches });
  });
}

module.exports = leaguesApiRoutes;
