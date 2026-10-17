'use strict';

const { AppError }   = require('../utils/errors');
const { generate: seGen } = require('./singleElim');

/**
 * Double elimination bracket generator.
 * WR1 seeding identical to single elimination.
 * Losers bracket: LR rounds 1..2(k-1).
 * Grand final: GF1 always; GF2 exists when bracket_reset=true (conditional).
 */
function generate(teams, params = {}) {
  const n             = teams.length;
  if (n < 3 || n > 128) throw new AppError(400, 'VALIDATION_ERROR', 'Double elimination requires 3–128 teams.', { fields: ['teams'] });

  const bracketReset = params.bracket_reset ?? false;
  const results      = params.results ?? [];

  // Build winners bracket (same as single elim without third-place)
  let B = 1;
  while (B < n) B *= 2;
  const k = Math.log2(B);

  // WR matches
  const wrRounds  = [];
  const matchMap  = {};
  const seedElim  = seGen(teams, { third_place_match: false });

  for (const round of seedElim.rounds) {
    const wrMatches = round.matches.map(m => ({
      ...m,
      match_id: m.match_id.replace(/^R/, 'WR'),
      bracket:  'winners',
      winner_to: m.winner_to ? { match_id: m.winner_to.match_id.replace(/^R/, 'WR'), slot: m.winner_to.slot } : null,
      loser_to:  null, // wired below
    }));
    wrMatches.forEach(m => matchMap[m.match_id] = m);
    wrRounds.push({ round: round.round, matches: wrMatches });
  }

  // LR rounds: 2*(k-1) rounds total
  const lrRounds = [];
  for (let j = 1; j <= k - 1; j++) {
    const count = B / Math.pow(2, j + 1);
    // LR odd round (2j-1): receives losers from WR round j
    const lrOdd = [];
    for (let i = 1; i <= count; i++) {
      const mid = `LR${2*j-1}M${i}`;
      const m   = { match_id: mid, bracket: 'losers', round: 2*j-1, index: i, home: null, away: null, home_seed: null, away_seed: null, bye: false, winner: null, loser: null, winner_to: { match_id: `LR${2*j}M${Math.ceil(i/2)}`, slot: i%2!==0?'home':'away' }, loser_to: null };
      lrOdd.push(m);
      matchMap[mid] = m;
    }
    lrRounds.push({ round: 2*j-1, matches: lrOdd });

    // LR even round (2j): survivors play each other
    const lrEven = [];
    for (let i = 1; i <= count; i++) {
      const mid = `LR${2*j}M${i}`;
      const isLast = j === k - 1 && i === 1;
      const m   = { match_id: mid, bracket: 'losers', round: 2*j, index: i, home: null, away: null, home_seed: null, away_seed: null, bye: false, winner: null, loser: null, winner_to: isLast ? { match_id: 'GF1', slot: 'away' } : { match_id: `LR${2*j+1}M${Math.ceil(i/2)}`, slot: i%2!==0?'home':'away' }, loser_to: null };
      lrEven.push(m);
      matchMap[mid] = m;
    }
    lrRounds.push({ round: 2*j, matches: lrEven });
  }

  // Wire WR loser_to: WR round r losers go to LR round 2(r-1) for r>=2, LR round 1 for r=1
  for (let r = 1; r <= k; r++) {
    const wrRound = wrRounds[r - 1];
    if (!wrRound) continue;
    for (let i = 0; i < wrRound.matches.length; i++) {
      const m = wrRound.matches[i];
      if (r === k) { m.loser_to = null; continue; } // WR final loser → LB final away
      const lrRoundNum = r === 1 ? 1 : 2*(r-1);
      const lrMid = `LR${lrRoundNum}M${i + 1}`;
      m.loser_to = matchMap[lrMid] ? { match_id: lrMid, slot: 'away' } : null;
    }
  }

  // WR final loser → LB final away slot
  const wrFinalRound = wrRounds[k - 1];
  if (wrFinalRound) {
    const wrFinal = wrFinalRound.matches[0];
    const lbFinalMid = `LR${2*(k-1)}M1`;
    if (wrFinal) wrFinal.loser_to = matchMap[lbFinalMid] ? { match_id: lbFinalMid, slot: 'away' } : null;
    if (wrFinal) wrFinal.winner_to = { match_id: 'GF1', slot: 'home' };
  }

  // Grand final
  const gf1 = { match_id: 'GF1', bracket: 'grand_final', round: 1, index: 1, home: null, away: null, home_seed: null, away_seed: null, bye: false, winner: null, loser: null, winner_to: null, loser_to: null };
  const gf2 = { match_id: 'GF2', bracket: 'grand_final', round: 2, index: 1, home: null, away: null, home_seed: null, away_seed: null, bye: false, winner: null, loser: null, winner_to: null, loser_to: null, conditional: true, required: null };
  matchMap['GF1'] = gf1;
  matchMap['GF2'] = gf2;

  // Apply results
  for (const res of results) {
    const rid = res.match_id.startsWith('R') ? res.match_id.replace(/^R/, 'WR') : res.match_id;
    const m   = matchMap[rid] || matchMap[res.match_id];
    if (!m) throw new AppError(400, 'VALIDATION_ERROR', `Unknown match_id: ${res.match_id}`, { fields: ['params.results'] });
    const participants = [m.home, m.away].filter(Boolean);
    if (!participants.includes(res.winner)) throw new AppError(400, 'VALIDATION_ERROR', `Winner '${res.winner}' not a participant.`, { fields: ['params.results'] });
    m.winner = res.winner;
    m.loser  = participants.find(t => t !== res.winner) || null;
    if (m.winner_to) {
      const next = matchMap[m.winner_to.match_id];
      if (next) next[m.winner_to.slot] = res.winner;
    }
    if (m.loser_to && m.loser) {
      const next = matchMap[m.loser_to.match_id];
      if (next) next[m.loser_to.slot] = m.loser;
    }
  }

  // GF2 required logic
  if (bracketReset && gf1.winner) {
    const lbFinalMid = `LR${2*(k-1)}M1`;
    const lbChampion = matchMap[lbFinalMid]?.winner;
    gf2.required = gf1.winner === gf1.away && gf1.away === lbChampion;
  }

  return {
    format:        'double_elim',
    bracket_size:  B,
    bracket_reset: bracketReset,
    winners:       wrRounds,
    losers:        lrRounds,
    grand_final:   bracketReset ? [gf1, gf2] : [gf1],
  };
}

module.exports = { generate };
