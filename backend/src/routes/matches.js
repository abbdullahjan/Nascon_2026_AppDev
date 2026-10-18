'use strict';

const db             = require('../config/db');
const scoreService   = require('../services/scoreService');
const eventsService  = require('../services/eventsService');
const { sendError, AppError } = require('../utils/errors');

/**
 * /api/v1/matches routes
 * Provides live match listings, detailed match scoreboards, event timelines,
 * and score event creation for the mobile app.
 */
async function matchesRoutes(fastify) {
  // GET /api/v1/matches — list fixtures & live matches
  fastify.get('/matches', async (request, reply) => {
    const { league_id, status, club_id, sport_id } = request.query || {};

    let query = db('matches').select('*');
    if (league_id) query = query.where({ league_id });
    if (status)    query = query.where({ status });
    if (sport_id)  query = query.where({ sport_id });
    if (club_id) {
      query = query.where(builder => {
        builder.where({ home_team: club_id }).orWhere({ away_team: club_id });
      });
    }

    const rows = await query.orderBy('created_at', 'desc');

    // Build enriched list with live score summaries
    const matches = [];
    for (const m of rows) {
      let scoreInfo = null;
      try {
        const scoreProjection = await scoreService.getScore(m.match_id);
        scoreInfo = {
          home_score: scoreProjection.home?.score ?? 0,
          away_score: scoreProjection.away?.score ?? 0,
          home_wickets: scoreProjection.home?.wickets,
          away_wickets: scoreProjection.away?.wickets,
          home_overs: scoreProjection.home?.overs,
          away_overs: scoreProjection.away?.overs,
          outcome: scoreProjection.outcome,
          winner_team_id: scoreProjection.winner_team_id,
        };
      } catch (err) {
        // Fallback if no score events recorded yet
        scoreInfo = {
          home_score: 0,
          away_score: 0,
          outcome: m.status === 'completed' ? 'draw' : 'pending',
          winner_team_id: null,
        };
      }

      // Fetch club names if available
      const homeClub = await db('clubs').where({ club_id: m.home_team }).first();
      const awayClub = await db('clubs').where({ club_id: m.away_team }).first();

      matches.push({
        match_id:       m.match_id,
        league_id:      m.league_id,
        sport_id:       m.sport_id,
        home_team:      m.home_team,
        away_team:      m.away_team,
        home_team_name: homeClub ? homeClub.name : m.home_team,
        away_team_name: awayClub ? awayClub.name : m.away_team,
        status:         m.status,
        score:          scoreInfo,
        created_at:     m.created_at,
      });
    }

    return reply.status(200).send({ matches });
  });

  // GET /api/v1/matches/:match_id — match details with live score projection & pinned product
  fastify.get('/matches/:match_id', async (request, reply) => {
    const { match_id } = request.params;

    const matchRow = await db('matches').where({ match_id }).first();
    if (!matchRow) {
      return sendError(reply, 404, 'MATCH_NOT_FOUND', `Match '${match_id}' not found.`, {});
    }

    let scoreProjection;
    try {
      scoreProjection = await scoreService.getScore(match_id);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send({
          error: { code: err.errorCode, message: err.message, details: err.details },
        });
      }
      throw err;
    }

    const homeClub = await db('clubs').where({ club_id: matchRow.home_team }).first();
    const awayClub = await db('clubs').where({ club_id: matchRow.away_team }).first();

    // Pinned merchandise product for this match
    let pinnedProduct = null;
    const prodRow = await db('products').first();
    if (prodRow) {
      const variant = await db('product_variants').where({ product_id: prodRow.product_id }).first();
      pinnedProduct = {
        product_id:  prodRow.product_id,
        name:        prodRow.name,
        price_minor: variant ? variant.price_minor : 450000,
        currency:    variant ? variant.currency : 'PKR',
        variant_id:  variant ? variant.variant_id : null,
      };
    }

    return reply.status(200).send({
      match: {
        ...scoreProjection,
        home_team_name: homeClub ? homeClub.name : matchRow.home_team,
        away_team_name: awayClub ? awayClub.name : matchRow.away_team,
        pinned_product: pinnedProduct,
      },
    });
  });

  // GET /api/v1/matches/:match_id/events — timeline of events
  fastify.get('/matches/:match_id/events', async (request, reply) => {
    const { match_id } = request.params;

    const matchRow = await db('matches').where({ match_id }).first();
    if (!matchRow) {
      return sendError(reply, 404, 'MATCH_NOT_FOUND', `Match '${match_id}' not found.`, {});
    }

    const events = await db('match_events').where({ match_id }).orderBy('sequence', 'asc');
    const parsed = events.map(ev => ({
      sequence:       ev.sequence,
      event_id:       ev.event_id,
      type:           ev.type,
      payload:        typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload,
      signature:      ev.signature,
      compensated:    Boolean(ev.compensated),
      compensated_by: ev.compensated_by || null,
      created_at:     ev.created_at,
    }));

    return reply.status(200).send({ match_id, events: parsed });
  });

  // POST /api/v1/matches/:match_id/events — score entry by league organizer
  fastify.post('/matches/:match_id/events', async (request, reply) => {
    const { match_id } = request.params;
    const body = request.body || {};

    if (!body.match_id) {
      body.match_id = match_id;
    }

    try {
      const result = await eventsService.appendEvent(body);
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

module.exports = matchesRoutes;
