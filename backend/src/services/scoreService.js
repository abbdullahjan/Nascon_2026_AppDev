'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { getSport } = require('./sportsService');

/**
 * Rebuild the full score projection from the append-only event log.
 * Never reads mutable counters — always recomputes from events.
 */
async function getScore(match_id) {
  const match = await db('matches').where({ match_id }).first();
  if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', `Match '${match_id}' not found.`, {});

  const sport  = await getSport(match.sport_id);
  const events = await db('match_events').where({ match_id }).orderBy('sequence', 'asc');

  // Build set of compensated event ids (from active compensation events)
  const compensatedIds = new Set();
  for (const ev of events) {
    if (ev.type === 'compensation') {
      const compPayload = JSON.parse(ev.payload);
      compensatedIds.add(compPayload.compensates);
    }
  }

  // ── Project score from active (non-compensated) events ─────────────────────
  const home = { team_id: match.home_team, score: 0, wickets: null, balls: null, overs: null, fair_play: 0 };
  const away = { team_id: match.away_team, score: 0, wickets: null, balls: null, overs: null, fair_play: 0 };

  // Initialise innings model fields
  if (sport.scoring_model === 'innings') {
    home.wickets = 0; home.balls = 0;
    away.wickets = 0; away.balls = 0;
  }

  let activeTiebreakWinner = null;

  for (const ev of events) {
    // Skip compensated events (their effect is neutral)
    if (compensatedIds.has(ev.event_id)) continue;
    // Skip compensation events themselves (neutral)
    if (ev.type === 'compensation') continue;

    const payload = JSON.parse(ev.payload);
    const side = payload.team_id === match.home_team ? home : away;

    if (ev.type === 'score') {
      const eventDef = sport.scoring_events[payload.event_type];
      if (!eventDef) continue; // safety: unknown event type in stored data

      if (sport.scoring_model === 'event') {
        side.score += eventDef.points;
      } else if (sport.scoring_model === 'innings') {
        side.score += eventDef.runs;
        if (eventDef.legal_ball) side.balls += 1;
        if (eventDef.wicket)     side.wickets += 1;
      } else if (sport.scoring_model === 'round') {
        side.score += eventDef.rounds;
      }
    }

    if (ev.type === 'discipline') {
      side.fair_play += payload.points;
    }

    if (ev.type === 'tiebreak_winner') {
      activeTiebreakWinner = payload.team_id;
    }
  }

  // ── Compute overs string for innings model ─────────────────────────────────
  if (sport.scoring_model === 'innings') {
    const bpo = sport.periods.balls_per_over;
    home.overs = `${Math.floor(home.balls / bpo)}.${home.balls % bpo}`;
    away.overs = `${Math.floor(away.balls / bpo)}.${away.balls % bpo}`;
  }

  // ── Determine outcome ──────────────────────────────────────────────────────
  let outcome = 'pending';
  let winner  = null;

  if (match.status === 'completed') {
    if (home.score > away.score) {
      outcome = 'home_win';
      winner  = match.home_team;
    } else if (away.score > home.score) {
      outcome = 'away_win';
      winner  = match.away_team;
    } else if (activeTiebreakWinner) {
      // Score level but tiebreak winner exists
      outcome = activeTiebreakWinner === match.home_team ? 'home_win' : 'away_win';
      winner  = activeTiebreakWinner;
    } else if (sport.draw_allowed) {
      outcome = 'draw';
    } else {
      outcome = 'undecided';
    }
  }

  // ── Build events list ──────────────────────────────────────────────────────
  const eventList = events.map(ev => ({
    sequence:       ev.sequence,
    event_id:       ev.event_id,
    type:           ev.type,
    payload:        JSON.parse(ev.payload),
    signature:      ev.signature,
    compensated:    compensatedIds.has(ev.event_id),
    compensated_by: ev.compensated_by || null,
  }));

  return {
    match_id,
    sport_id:               match.sport_id,
    league_id:              match.league_id || null,
    status:                 match.status,
    outcome,
    winner_team_id:         winner,
    tiebreak_winner_team_id: activeTiebreakWinner,
    home,
    away,
    version:                events.length,
    events:                 eventList,
  };
}

module.exports = { getScore };
