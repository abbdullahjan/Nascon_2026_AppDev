'use strict';

const { AppError } = require('../utils/errors');

/**
 * Single elimination bracket.
 *
 * Bracket size B = smallest power of 2 >= n.
 * Seed order (exact per spec):
 *   order(2)  = [1, 2]
 *   order(2k) = for each s in order(k): [s, 2k+1-s]
 *   order(8)  = [1,8,4,5,2,7,3,6]
 *
 * Round-1 match i (1-based):
 *   home = order[2i-2], away = order[2i-1]  (lower seed number = home)
 *   seed > n → missing (bye match: bye:true, away:null, winner = present team)
 *
 * Advancement:
 *   Winner of R{r}M{i} → R{r+1}M{ceil(i/2)}, slot: home if i odd, away if even.
 */
function generate(teams, params = {}) {
  const n = teams.length;
  if (n < 2 || n > 128) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Single elimination requires 2–128 teams.', { fields: ['teams'] });
  }

  const thirdPlaceMatch = params.third_place_match ?? false;
  const results         = params.results ?? [];

  // Bracket size
  let B = 1;
  while (B < n) B *= 2;

  const totalRounds = Math.log2(B); // always integer since B is power of 2
  const seedOrder   = buildSeedOrder(B);
  const matchMap    = {};
  const rounds      = [];

  // ── Round 1 ───────────────────────────────────────────────────────────────
  const r1Matches = [];
  for (let i = 0; i < B / 2; i++) {
    const s1    = seedOrder[2 * i];       // home seed
    const s2    = seedOrder[2 * i + 1];   // away seed
    const t1    = s1 <= n ? teams[s1 - 1] : null;
    const t2    = s2 <= n ? teams[s2 - 1] : null;
    const isBye = t1 === null || t2 === null;
    const idx   = i + 1;
    const mid   = `R1M${idx}`;

    // Lower seed number = home (s1 < s2 always in spec seed order)
    const home = isBye ? (t1 ?? t2) : t1;  // s1 is always lower seed
    const away = isBye ? null : t2;

    const match = {
      match_id:   mid,
      bracket:    'main',
      round:      1,
      index:      idx,
      home,
      away,
      home_seed:  s1 <= n ? s1 : null,
      away_seed:  s2 <= n ? s2 : null,
      bye:        isBye,
      winner:     isBye ? (t1 ?? t2) : null,  // bye winner propagated immediately
      loser:      null,
      winner_to:  null,  // wired below
      loser_to:   null,
    };

    r1Matches.push(match);
    matchMap[mid] = match;
  }
  rounds.push({ round: 1, matches: r1Matches });

  // ── Rounds 2..totalRounds ─────────────────────────────────────────────────
  for (let r = 2; r <= totalRounds; r++) {
    const count   = B / Math.pow(2, r);
    const matches = [];
    for (let i = 1; i <= count; i++) {
      const mid   = `R${r}M${i}`;
      const isLastRound = r === totalRounds;
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
        winner_to: isLastRound
          ? null
          : { match_id: `R${r + 1}M${Math.ceil(i / 2)}`, slot: i % 2 !== 0 ? 'home' : 'away' },
        loser_to:  null,
      };
      matches.push(match);
      matchMap[mid] = match;
    }
    rounds.push({ round: r, matches });
  }

  // ── Wire R1 winner_to + propagate bye winners ─────────────────────────────
  for (const m of r1Matches) {
    if (totalRounds === 1) {
      // Only 2 teams: final is R1M1, no next round
      m.winner_to = null;
    } else {
      const nextIdx = Math.ceil(m.index / 2);
      const slot    = m.index % 2 !== 0 ? 'home' : 'away';
      m.winner_to   = { match_id: `R2M${nextIdx}`, slot };

      // Propagate bye winner into next round immediately
      if (m.bye && m.winner) {
        const next = matchMap[`R2M${nextIdx}`];
        if (next) next[slot] = m.winner;
      }
    }
  }

  // ── Third-place match ─────────────────────────────────────────────────────
  if (thirdPlaceMatch && totalRounds >= 2) {
    const sfRound = totalRounds - 1;               // semifinal round
    const sf1     = matchMap[`R${sfRound}M1`];
    const sf2     = matchMap[`R${sfRound}M2`];
    const tp = {
      match_id:  'TP',
      bracket:   'third_place',
      round:     totalRounds,
      index:     1,
      home:      null,
      away:      null,
      home_seed: null,
      away_seed: null,
      bye:       false,
      winner:    null,
      loser:     null,
      winner_to: null,
      loser_to:  null,
    };
    if (sf1) sf1.loser_to = { match_id: 'TP', slot: 'home' };
    if (sf2) sf2.loser_to = { match_id: 'TP', slot: 'away' };
    matchMap['TP'] = tp;
    rounds[rounds.length - 1].matches.push(tp);
  }

  // ── Apply provided results ────────────────────────────────────────────────
  for (const res of results) {
    const m = matchMap[res.match_id];
    if (!m) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `Unknown match_id in results: ${res.match_id}`, { fields: ['params.results'] });
    }
    const participants = [m.home, m.away].filter(Boolean);
    if (!participants.includes(res.winner)) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `Winner '${res.winner}' is not a participant of '${res.match_id}'.`, { fields: ['params.results'] });
    }
    m.winner = res.winner;
    m.loser  = participants.find(t => t !== res.winner) ?? null;
    if (m.winner_to) {
      const next = matchMap[m.winner_to.match_id];
      if (next) next[m.winner_to.slot] = res.winner;
    }
  }

  return { format: 'single_elim', bracket_size: B, rounds };
}

/**
 * Recursive seed-order builder per spec:
 *   order(2)  = [1, 2]
 *   order(2k) = for each s in order(k): [s, 2k+1-s]
 */
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

module.exports = { generate, buildSeedOrder };
