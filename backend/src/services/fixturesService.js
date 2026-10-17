'use strict';

const { AppError } = require('../utils/errors');
const roundRobin   = require('../algorithms/roundRobin');
const swiss        = require('../algorithms/swiss');
const singleElim   = require('../algorithms/singleElim');
const doubleElim   = require('../algorithms/doubleElim');

/**
 * Route incoming fixture requests to the correct algorithm.
 * Pure computation — stores nothing in the database.
 */
async function generate(body) {
  const { format, teams, params = {} } = body;

  if (!Array.isArray(teams) || teams.length < 2) {
    throw new AppError(400, 'VALIDATION_ERROR', 'teams must be an array of at least 2 unique team ids.', { fields: ['teams'] });
  }

  // Check for duplicate team ids
  if (new Set(teams).size !== teams.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'teams array contains duplicate ids.', { fields: ['teams'] });
  }

  switch (format) {
    case 'round_robin':  return roundRobin.generate(teams, params);
    case 'swiss':        return swiss.generate(teams, params);
    case 'single_elim':  return singleElim.generate(teams, params);
    case 'double_elim':  return doubleElim.generate(teams, params);
    default:
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown format '${format}'.`, { fields: ['format'] });
  }
}

module.exports = { generate };
