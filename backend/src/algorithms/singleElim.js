'use strict';

const { AppError } = require('../utils/errors');

/**
 * Single elimination bracket generator.
 * Bracket size B = next power of two >= n.
 * Seed order: order(2k) = for each s in order(k): [s, 2k+1-s]
 * Round-1 match i: (2i-1)th and 2i-th seeds. Lower seed = home.
 * Seeds > n are missing (bye matches).
 */
function generate(teams, params = {}) {
  const n = teams.length;
  if (n < 2 || n > 128) throw new AppError(400, 'VALIDATION_ERROR', 'Single elimination requires 2–128 teams.', { fields: ['teams'] });

  const thirdPlaceMatch = params.third_place_match ?? false;
  const results         = params.results ?? [];

  // Compute bracket size
  let B = 1;
  while (B < n) B *= 2;

  // Build seed order
  const seedOrder = buildSeedOrder(B);
  // seedOrder[i] = seed number (1-based); teams[seed-1] = team id (seeds > n = missing)

  // Build rounds
  const rounds = [];
  const matchMap = {}; // match_id → match object

  // Round 1
  const r1Matches = [];
  for (let i = 0; i < B / 2; i++) {
    const s1 = seedOrder[2 * i];
    const s2 = seedOrder[2 * i + 1];
    const t1 = s1 <= n ? teams[s1 - 1] : null;
    const t2 = s2 <= n ? teams[s2 - 1] : null;
    const isBye = t1 === null || t2 === null;
    const idx   = i + 1;
    const mid   = `R1M${idx}`;

    const match = {
      match_id:   mid,
      bracket:    'main',
      round:      1,
      index:      idx,
      home:       isBye ? (t1 || t2) : (s1 < s2 ? t1 : t2),
      away:       isBye ? null : (s1 < s2 ? t2 : t1),
      home_seed:  s1 <= n ? s1 : null,
      away_seed:  s2 <= n ? s2 : null,
      bye:        isBye,
      winner:     null,
      loser:      null,
      winner_to:  null,
      loser_to:   null,
    };
    if (isBye) match.winner = t1 || t2; // bye winner is the present team

    r1Matches.push(match);
    matchMap[mid] = match;
  }
  rounds.push({ round: 1, matches: r1Matches });

  const totalRounds = Math.log2(B);

  // Build subsequent rounds
  for (let r = 2; r <= totalRounds; r++) {
    const count   = B / Math.pow(2, r);
    const matches = [];
    for (let i = 1; i <= count; i++) {
      const mid   = `R${r}M${i}`;
      const match = {
        match_id:  mid,
        bracket:   'main',
        round:     r,
        index:     i,
        home:      null,
        away:      null,
        home_seed: null,
        away_seed: null,
        bye:       false,
        winner:    null,
        loser:     null,
        winner_to: r < totalRounds ? { match_id: `R${r+1}M${Math.ceil(i/2)}`, slot: i % 2 !== 0 ? 'home' : 'away' } : null,
        loser_to:  null,
      };
      matches.push(match);
      matchMap[mid] = match;
    }
    rounds.push({ round: r, matches });
  }

  // Wire winner_to for round 1 and propagate bye winners
  for (const m of r1Matches) {
    const nextRound = 2;
    const nextIdx   = Math.ceil(m.index / 2);
    const slot      = m.index % 2 !== 0 ? 'home' : 'away';
    m.winner_to     = { match_id: `R${nextRound}M${nextIdx}`, slot };

    if (m.bye && m.winner) {
      const next = matchMap[`R${nextRound}M${nextIdx}`];
      if (next) next[slot] = m.winner;
    }
  }

  // Add third-place match
  if (thirdPlaceMatch && totalRounds >= 2) {
    const sf1 = matchMap[`R${totalRounds - 1}M1`];
    const sf2 = matchMap[`R${totalRounds - 1}M2`];
    const tp  = {
      match_id:  'TP',
      bracket:   'third_place',
      round:     totalRounds,
      index:     1,
      home:      null, away: null,
      home_seed: null, away_seed: null,
      bye: false, winner: null, loser: null,
      winner_to: null, loser_to: null,
    };
    if (sf1) sf1.loser_to = { match_id: 'TP', slot: 'home' };
    if (sf2) sf2.loser_to = { match_id: 'TP', slot: 'away' };
    matchMap['TP'] = tp;
    rounds[rounds.length - 1].matches.push(tp);
  }

  // Apply provided results
  for (const res of results) {
    const m = matchMap[res.match_id];
    if (!m) throw new AppError(400, 'VALIDATION_ERROR', `Unknown match_id in results: ${res.match_id}`, { fields: ['params.results'] });
    const participants = [m.home, m.away].filter(Boolean);
    if (!participants.includes(res.winner)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Winner '${res.winner}' is not a participant of match '${res.match_id}'.`, { fields: ['params.results'] });
    }
    m.winner = res.winner;
    m.loser  = participants.find(t => t !== res.winner) || null;
    if (m.winner_to) {
      const next = matchMap[m.winner_to.match_id];
      if (next) next[m.winner_to.slot] = res.winner;
    }
  }

  return { format: 'single_elim', bracket_size: B, rounds };
}

function buildSeedOrder(B) {
  if (B === 2) return [1, 2];
  const half  = buildSeedOrder(B / 2);
  const order = [];
  for (const s of half) {
    order.push(s);
    order.push(B + 1 - s);
  }
  return order;
}

module.exports = { generate };
