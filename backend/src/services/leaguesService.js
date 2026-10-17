'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { getSport } = require('./sportsService');

const VALID_TIEBREAKS = ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'];

async function createLeague(body) {
  const { league_id, sport_id, teams, fixtures, points, tie_break_order, qualification, lots_seed } = body;

  // ── 1. Schema validation ───────────────────────────────────────────────────
  if (!league_id || typeof league_id !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'league_id is required.', { fields: ['league_id'] });
  }
  if (!sport_id || typeof sport_id !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'sport_id is required.', { fields: ['sport_id'] });
  }
  if (!Array.isArray(teams) || teams.length < 2 || teams.length > 40) {
    throw new AppError(400, 'VALIDATION_ERROR', 'teams must be an array of 2–40 entries.', { fields: ['teams'] });
  }
  if (new Set(teams).size !== teams.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'teams contains duplicates.', { fields: ['teams'] });
  }
  if (!Array.isArray(fixtures)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'fixtures must be an array.', { fields: ['fixtures'] });
  }
  if (!qualification || !Number.isInteger(qualification.spots) || qualification.spots < 1 || qualification.spots > teams.length) {
    throw new AppError(400, 'VALIDATION_ERROR', `qualification.spots must be an integer 1..${teams.length}.`, { fields: ['qualification.spots'] });
  }

  // Validate points (optional, defaults win=3/draw=1/loss=0)
  const pts = points || { win: 3, draw: 1, loss: 0 };
  if (!Number.isInteger(pts.win) || !Number.isInteger(pts.draw) || !Number.isInteger(pts.loss)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'points.win, points.draw, points.loss must be integers.', { fields: ['points'] });
  }

  // Validate tie_break_order (optional)
  let tbo = tie_break_order;
  if (tbo !== undefined) {
    if (!Array.isArray(tbo)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'tie_break_order must be an array.', { fields: ['tie_break_order'] });
    }
    const seen = new Set();
    for (const item of tbo) {
      if (!VALID_TIEBREAKS.includes(item) || seen.has(item)) {
        throw new AppError(400, 'VALIDATION_ERROR', `Invalid or duplicate tie-break: ${item}`, { fields: ['tie_break_order'] });
      }
      seen.add(item);
    }
  }

  // ── 2. Sport must exist → 404 ──────────────────────────────────────────────
  const sport = await getSport(sport_id);  // throws 404 SPORT_NOT_FOUND

  // ── 3. League duplicate → 409 ──────────────────────────────────────────────
  const existingLeague = await db('leagues').where({ league_id }).first();
  if (existingLeague) throw new AppError(409, 'LEAGUE_EXISTS', `League '${league_id}' already exists.`, {});

  // ── 4. Validate fixtures ────────────────────────────────────────────────────
  const teamSet    = new Set(teams);
  const matchIds   = new Set();

  for (const fix of fixtures) {
    if (!fix.match_id || !fix.home || !fix.away) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Each fixture needs match_id, home, away.', { fields: ['fixtures'] });
    }
    if (!teamSet.has(fix.home) || !teamSet.has(fix.away)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Fixture team '${fix.home}' or '${fix.away}' not in teams list.`, { fields: ['fixtures'] });
    }
    if (fix.home === fix.away) {
      throw new AppError(400, 'VALIDATION_ERROR', 'home and away must differ.', { fields: ['fixtures'] });
    }
    // Duplicate match_id within this request
    if (matchIds.has(fix.match_id)) {
      throw new AppError(409, 'MATCH_EXISTS', `Match '${fix.match_id}' already exists.`, {});
    }
    matchIds.add(fix.match_id);

    // Duplicate match_id in DB
    const existingMatch = await db('matches').where({ match_id: fix.match_id }).first();
    if (existingMatch) throw new AppError(409, 'MATCH_EXISTS', `Match '${fix.match_id}' already exists.`, {});
  }

  // ── 5. Resolve lots_seed default from app_config ──────────────────────────
  let resolvedLotsSeed = lots_seed;
  if (resolvedLotsSeed === undefined) {
    const configRow = await db('app_config').where({ key: 'lots_seed' }).first();
    resolvedLotsSeed = configRow ? parseInt(configRow.value) : 42;
  }

  // ── 6. Normalise tie_break_order — draw_lots always last ───────────────────
  let finalTbo = tbo || sport.tie_break_order.filter(t => t !== 'draw_lots');
  if (!finalTbo.includes('draw_lots')) finalTbo = [...finalTbo, 'draw_lots'];

  // ── 7. Persist league + matches ────────────────────────────────────────────
  const config = {
    sport_id,
    teams,
    points:          pts,
    tie_break_order: finalTbo,
    qualification,
    lots_seed:       resolvedLotsSeed,
  };

  await db.transaction(async (trx) => {
    await trx('leagues').insert({
      league_id,
      tenant_id: null,
      sport_id,
      config:   JSON.stringify(config),
    });

    for (const fix of fixtures) {
      await trx('matches').insert({
        match_id:  fix.match_id,
        league_id,
        sport_id,
        home_team: fix.home,
        away_team: fix.away,
        status:    'upcoming',
      });
    }
  });

  return {
    league_id,
    status:         'created',
    team_count:     teams.length,
    fixture_count:  fixtures.length,
  };
}

module.exports = { createLeague };
