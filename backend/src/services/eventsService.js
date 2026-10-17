'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { sign }     = require('../utils/hmac');
const { getSport } = require('./sportsService');

const VALID_TYPES = ['match_init','match_start','score','discipline','tiebreak_winner','match_end','compensation'];

async function appendEvent(body) {
  const { event_id, match_id, type, payload = {} } = body;

  // ── Basic schema validation ───────────────────────────────────────────────
  if (!event_id || typeof event_id !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'event_id is required.', { fields: ['event_id'] });
  }
  if (!match_id || typeof match_id !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'match_id is required.', { fields: ['match_id'] });
  }
  if (!type || !VALID_TYPES.includes(type)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Unknown event type '${type}'.`, { fields: ['type'] });
  }

  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await db('match_events').where({ event_id }).first();
  if (existing) {
    if (existing.raw_body === JSON.stringify(body)) {
      return { _isReplay: true, data: JSON.parse(existing.response_body) };
    }
    throw new AppError(409, 'DUPLICATE_EVENT_ID', `Event id '${event_id}' already used with a different body.`, {});
  }

  // ── Get or create match stream ────────────────────────────────────────────
  let match = await db('matches').where({ match_id }).first();

  if (type === 'match_init') {
    if (match) throw new AppError(409, 'MATCH_EXISTS', `Match '${match_id}' already exists.`, {});
    if (!payload.sport_id) throw new AppError(400, 'VALIDATION_ERROR', 'sport_id required in match_init payload.', { fields: ['payload.sport_id'] });
    const sport = await getSport(payload.sport_id); // throws 404
    if (!payload.home_team_id || !payload.away_team_id) {
      throw new AppError(400, 'VALIDATION_ERROR', 'home_team_id and away_team_id required.', { fields: ['payload'] });
    }
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

  // ── State machine validation ──────────────────────────────────────────────
  if (type === 'match_start') {
    if (match.status !== 'upcoming') {
      throw new AppError(409, 'ILLEGAL_TRANSITION', 'Match must be upcoming to start.', {});
    }
  }
  if (['score', 'discipline', 'tiebreak_winner'].includes(type)) {
    if (match.status !== 'in_progress') {
      throw new AppError(409, 'MATCH_NOT_IN_PROGRESS', 'Match is not in progress.', {});
    }
  }
  if (type === 'match_end') {
    if (match.status !== 'in_progress') {
      throw new AppError(409, 'ILLEGAL_TRANSITION', 'Match must be in progress to end.', {});
    }
  }

  // ── Load sport config for sport-specific validation ───────────────────────
  const sport = await getSport(match.sport_id);

  // ── Validate team_id for score / discipline / tiebreak_winner ──────────────
  if (['score', 'discipline', 'tiebreak_winner'].includes(type)) {
    if (!payload.team_id || (payload.team_id !== match.home_team && payload.team_id !== match.away_team)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'team_id must be home or away team.', { fields: ['payload.team_id'] });
    }
  }

  // ── Validate score event type against sport config ─────────────────────────
  if (type === 'score') {
    if (!payload.event_type || !sport.scoring_events[payload.event_type]) {
      throw new AppError(400, 'UNKNOWN_EVENT_TYPE',
        `Event type '${payload.event_type}' not defined for sport '${match.sport_id}'.`, {});
    }
  }

  // ── Validate compensation ──────────────────────────────────────────────────
  if (type === 'compensation') {
    if (!payload.compensates) {
      throw new AppError(400, 'VALIDATION_ERROR', 'compensates is required in compensation payload.', { fields: ['payload.compensates'] });
    }
    const targetEvent = await db('match_events').where({ event_id: payload.compensates }).first();
    if (!targetEvent) {
      throw new AppError(404, 'EVENT_NOT_FOUND', `Event '${payload.compensates}' not found.`, {});
    }
    if (targetEvent.match_id !== match_id) {
      throw new AppError(409, 'INVALID_COMPENSATION', 'Target event belongs to a different match.', {});
    }
    if (!['score', 'discipline', 'tiebreak_winner'].includes(targetEvent.type)) {
      throw new AppError(409, 'INVALID_COMPENSATION', 'Only score, discipline, or tiebreak_winner events can be compensated.', {});
    }
    if (targetEvent.compensated) {
      throw new AppError(409, 'INVALID_COMPENSATION', 'Target event is already compensated.', {});
    }
  }

  // ── Config-driven scoring limits ──────────────────────────────────────────
  if (type === 'score' && sport.scoring_model === 'innings') {
    const p = sport.periods;
    const maxBalls   = p.innings_per_team * p.overs_per_innings * p.balls_per_over;
    const maxWickets = p.innings_per_team * p.wickets_per_innings;
    // Count active balls/wickets for this team (excluding compensated)
    const allEvents = await db('match_events').where({ match_id }).orderBy('sequence', 'asc');
    const compIds = new Set(allEvents.filter(e => e.type === 'compensation').map(e => JSON.parse(e.payload).compensates));
    let teamBalls = 0, teamWickets = 0;
    for (const e of allEvents) {
      if (compIds.has(e.event_id) || e.type === 'compensation') continue;
      if (e.type !== 'score') continue;
      const ep = JSON.parse(e.payload);
      if (ep.team_id !== payload.team_id) continue;
      const ed = sport.scoring_events[ep.event_type];
      if (!ed) continue;
      if (ed.legal_ball) teamBalls++;
      if (ed.wicket) teamWickets++;
    }
    if (teamBalls >= maxBalls || teamWickets >= maxWickets) {
      throw new AppError(409, 'INNINGS_COMPLETE', 'Innings is already complete for this team.', {});
    }
  }

  if (type === 'score' && sport.scoring_model === 'round') {
    const bestOf = sport.periods.best_of;
    const neededRounds = Math.floor((bestOf + 1) / 2);
    const allEvents = await db('match_events').where({ match_id }).orderBy('sequence', 'asc');
    const compIds = new Set(allEvents.filter(e => e.type === 'compensation').map(e => JSON.parse(e.payload).compensates));
    let teamRounds = 0;
    for (const e of allEvents) {
      if (compIds.has(e.event_id) || e.type === 'compensation') continue;
      if (e.type !== 'score') continue;
      const ep = JSON.parse(e.payload);
      if (ep.team_id !== payload.team_id) continue;
      teamRounds += sport.scoring_events[ep.event_type]?.rounds || 0;
    }
    if (teamRounds >= neededRounds) {
      throw new AppError(409, 'SERIES_ALREADY_DECIDED', 'Series is already decided.', {});
    }
  }

  // ── Get current sequence ──────────────────────────────────────────────────
  const seqRow      = await db('match_events').where({ match_id }).count('* as cnt').first();
  const sequence    = parseInt(seqRow.cnt) + 1;
  const matchVersion = sequence;

  // ── Compute signature ──────────────────────────────────────────────────────
  const signature = sign(event_id, payload);

  // ── Append event ──────────────────────────────────────────────────────────
  const responseData = { event_id, match_id, type, sequence, match_version: matchVersion, signature };
  await db('match_events').insert({
    event_id,
    match_id,
    type,
    sequence,
    payload:        JSON.stringify(payload),
    signature,
    compensated:    false,
    compensated_by:  null,
    raw_body:       JSON.stringify(body),
    response_body:  JSON.stringify(responseData),
  });

  // ── Mark compensated event + update state ──────────────────────────────────
  if (type === 'compensation') {
    await db('match_events').where({ event_id: payload.compensates }).update({
      compensated:   true,
      compensated_by: event_id,
    });
  }

  if (type === 'match_start') {
    await db('matches').where({ match_id }).update({ status: 'in_progress' });
  }

  if (type === 'match_end') {
    // Check for tie with draw_allowed=false
    const scoreData = await require('./scoreService').getScore(match_id);
    if (scoreData.home.score === scoreData.away.score && !sport.draw_allowed && !scoreData.tiebreak_winner_team_id) {
      // TIE_NOT_ALLOWED — but we still appended the match_end event
      // Per spec: "If the score is level, draw_allowed is false, and no active tiebreak_winner → 409 TIE_NOT_ALLOWED"
      // We need to reject this. Roll back the event we just appended.
      await db('match_events').where({ event_id }).delete();
      throw new AppError(409, 'TIE_NOT_ALLOWED', 'Score is level and draws are not allowed.', {});
    }
    await db('matches').where({ match_id }).update({ status: 'completed' });
  }

  return { _isReplay: false, data: responseData };
}

module.exports = { appendEvent };
