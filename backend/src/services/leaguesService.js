'use strict';

const db              = require('../config/db');
const { AppError }    = require('../utils/errors');
const { getSport }    = require('./sportsService');

async function createLeague(body) {
  const { league_id, sport_id, teams, fixtures, points, tie_break_order, qualification, lots_seed } = body;

  if (!league_id || !sport_id || !Array.isArray(teams) || !Array.isArray(fixtures) || !qualification?.spots) {
    throw new AppError(400, 'VALIDATION_ERROR', 'league_id, sport_id, teams, fixtures, and qualification.spots are required.', { fields: [] });
  }
  if (teams.length < 2 || teams.length > 40) {
    throw new AppError(400, 'VALIDATION_ERROR', 'teams must have 2–40 entries.', { fields: ['teams'] });
  }
  if (new Set(teams).size !== teams.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'teams contains duplicates.', { fields: ['teams'] });
  }

  // Sport must exist
  const sport = await getSport(sport_id);

  // Check duplicate league
  const existingLeague = await db('leagues').where({ league_id }).first();
  if (existingLeague) throw new AppError(409, 'LEAGUE_EXISTS', `League '${league_id}' already exists.`, {});

  // Validate fixtures
  const teamSet = new Set(teams);
  for (const fix of fixtures) {
    if (!fix.match_id || !fix.home || !fix.away) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Each fixture needs match_id, home, away.', { fields: [] });
    }
    if (!teamSet.has(fix.home) || !teamSet.has(fix.away)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Fixture teams must be in the teams list.`, { fields: ['fixtures'] });
    }
    if (fix.home === fix.away) {
      throw new AppError(400, 'VALIDATION_ERROR', 'home and away must differ.', { fields: ['fixtures'] });
    }
    const existingMatch = await db('matches').where({ match_id: fix.match_id }).first();
    if (existingMatch) throw new AppError(409, 'MATCH_EXISTS', `Match '${fix.match_id}' already exists.`, {});
  }

  const config = {
    sport_id,
    teams,
    points:          points          || { win: 3, draw: 1, loss: 0 },
    tie_break_order: tie_break_order || sport.tie_break_order,
    qualification,
    lots_seed:       lots_seed       ?? 42,
  };

  await db.transaction(async (trx) => {
    await trx('leagues').insert({ league_id, tenant_id: null, sport_id, config: JSON.stringify(config) });

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

  return { league_id, status: 'created', team_count: teams.length, fixture_count: fixtures.length };
}

module.exports = { createLeague };
