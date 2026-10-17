'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { sign }     = require('../utils/hmac');
const { getSport } = require('./sportsService');

const VALID_TYPES = ['match_init','match_start','score','discipline','tiebreak_winner','match_end','compensation'];

async function appendEvent(body) {
  const { event_id, match_id, type, payload = {} } = body;

  if (!event_id || !match_id || !type) {
    throw new AppError(400, 'VALIDATION_ERROR', 'event_id, match_id, and type are required.', { fields: [] });
  }
  if (!VALID_TYPES.includes(type)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Unknown event type '${type}'.`, { fields: ['type'] });
  }

  // Idempotency check
  const existing = await db('match_events').where({ event_id }).first();
  if (existing) {
    const bodyStr = JSON.stringify(body);
    if (existing.raw_body === bodyStr) {
      return { _isReplay: true, data: JSON.parse(existing.response_body) };
    }
    throw new AppError(409, 'DUPLICATE_EVENT_ID', `Event id '${event_id}' already used with a different body.`, {});
  }

  // Get or create match stream
  let match = await db('matches').where({ match_id }).first();

  if (type === 'match_init') {
    if (match) throw new AppError(409, 'MATCH_EXISTS', `Match '${match_id}' already exists.`, {});
    if (!payload.sport_id) throw new AppError(400, 'VALIDATION_ERROR', 'sport_id required in payload.', { fields: ['payload.sport_id'] });
    await getSport(payload.sport_id); // throws 404 if not found
    await db('matches').insert({
      match_id,
      sport_id:  payload.sport_id,
      league_id: payload.league_id || null,
      home_team: payload.home_team_id,
      away_team: payload.away_team_id,
      status:    'upcoming',
    });
    match = await db('matches').where({ match_id }).first();
  } else {
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', `Match '${match_id}' not found.`, {});
  }

  // Validate state transitions
  if (type === 'match_start') {
    if (match.status !== 'upcoming') throw new AppError(409, 'ILLEGAL_TRANSITION', 'Match must be upcoming to start.', {});
  }
  if (['score','discipline','tiebreak_winner'].includes(type)) {
    if (match.status !== 'in_progress') throw new AppError(409, 'MATCH_NOT_IN_PROGRESS', 'Match is not in progress.', {});
  }
  if (type === 'match_end') {
    if (match.status !== 'in_progress') throw new AppError(409, 'ILLEGAL_TRANSITION', 'Match must be in progress to end.', {});
  }

  // Validate score event type against sport config
  if (type === 'score') {
    const sport = await getSport(match.sport_id);
    if (!payload.team_id || (payload.team_id !== match.home_team && payload.team_id !== match.away_team)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'team_id must be home or away team.', { fields: ['payload.team_id'] });
    }
    if (!sport.scoring_events[payload.event_type]) {
      throw new AppError(400, 'UNKNOWN_EVENT_TYPE', `Event type '${payload.event_type}' not defined for sport '${match.sport_id}'.`, {});
    }
  }

  // Get current sequence
  const seqRow = await db('match_events').where({ match_id }).count('* as cnt').first();
  const sequence     = parseInt(seqRow.cnt) + 1;
  const matchVersion = sequence;

  // Compute signature
  const signature = sign(event_id, payload);

  // Append event
  const responseData = { event_id, match_id, type, sequence, match_version: matchVersion, signature };
  await db('match_events').insert({
    event_id,
    match_id,
    type,
    sequence,
    payload:       JSON.stringify(payload),
    signature,
    compensated:   false,
    compensated_by: null,
    raw_body:      JSON.stringify(body),
    response_body: JSON.stringify(responseData),
  });

  // Apply state transitions
  if (type === 'match_start') await db('matches').where({ match_id }).update({ status: 'in_progress' });
  if (type === 'match_end')   await db('matches').where({ match_id }).update({ status: 'completed' });

  return { _isReplay: false, data: responseData };
}

module.exports = { appendEvent };
