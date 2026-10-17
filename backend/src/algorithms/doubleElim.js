'use strict';

const { AppError }                  = require('../utils/errors');
const { generate: seGen, buildSeedOrder } = require('./singleElim');

/**
 * Double elimination bracket.
 *
 * WR1 seeding is identical to single elimination.
 * WR IDs:  WR{r}M{i}   (round r, match i)
 * LR IDs:  LR{r}M{i}   rounds 1..2(k-1)
 *   - LR odd  round (2j-1): B/2^(j+1) matches — receives losers from WR{j}
 *   - LR even round (2j):   B/2^(j+1) matches — survivors face each other
 * GF1 always present; GF2 when bracket_reset:true (conditional).
 *
 * Routing:
 *   WR{r} loser → LR{2r-2} (r>=2) or LR1 (r=1), slot away
 *   WR final winner → GF1 home
 *   WR final loser  → LB final away
 *   LB final winner → GF1 away
 */
function generate(teams, params = {}) {
  const n = teams.length;
  if (n < 3 || n > 128) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Double elimination requires 3–128 teams.', { fields: ['teams'] });
  }

  const bracketReset = params.bracket_reset ?? false;
  const results      = params.results ?? [];

  let B = 1;
  while (B < n) B *= 2;
  const k = Math.log2(B);  // number of WR rounds

  const matchMap = {};

  // ── Winners bracket ───────────────────────────────────────────────────────
  // Build from single-elim, then rename R → WR
  const seResult = seGen(teams, { third_place_match: false, results: [] });
  const wrRounds = [];

  for (const seRound of seResult.rounds) {
    const wrMatches = seRound.matches.map(m => {
      const newId = m.match_id.replace(/^R/, 'WR');
      const wm    = {
        ...m,
        match_id:  newId,
        bracket:   'winners',
        winner_to: m.winner_to
          ? { match_id: m.winner_to.match_id.replace(/^R/, 'WR'), slot: m.winner_to.slot }
          : null,
        loser_to:  null,  // wired after LR is built
      };
      return wm;
    });
    wrMatches.forEach(m => { matchMap[m.match_id] = m; });
    wrRounds.push({ round: seRound.round, matches: wrMatches });
  }

  // Fix WR final: winner_to → GF1 home
  const wrFinalMatch = wrRounds[k - 1]?.matches[0];
  if (wrFinalMatch) wrFinalMatch.winner_to = { match_id: 'GF1', slot: 'home' };

  // ── Losers bracket ────────────────────────────────────────────────────────
  const lrRounds = [];

  for (let j = 1; j <= k - 1; j++) {
    const count = Math.max(1, B / Math.pow(2, j + 1));

    // LR odd round (2j-1): receives WR{j} losers
    const lrOddMatches = [];
    for (let i = 1; i <= count; i++) {
      const mid = `LR${2 * j - 1}M${i}`;
      const nextEvenMid = `LR${2 * j}M${Math.ceil(i / 2)}`;
      const m = {
        match_id:  mid,
        bracket:   'losers',
        round:     2 * j - 1,
        index:     i,
        home:      null,
        away:      null,
        home_seed: null,
        away_seed: null,
        bye:       false,
        winner:    null,
        loser:     null,
        winner_to: { match_id: nextEvenMid, slot: i % 2 !== 0 ? 'home' : 'away' },
        loser_to:  null,
      };
      lrOddMatches.push(m);
      matchMap[mid] = m;
    }
    lrRounds.push({ round: 2 * j - 1, matches: lrOddMatches });

    // LR even round (2j): survivors play each other
    const lrEvenMatches = [];
    for (let i = 1; i <= count; i++) {
      const mid    = `LR${2 * j}M${i}`;
      const isLast = j === k - 1;
      const winner_to = isLast
        ? { match_id: 'GF1', slot: 'away' }
        : { match_id: `LR${2 * j + 1}M${Math.ceil(i / 2)}`, slot: i % 2 !== 0 ? 'home' : 'away' };
      const m = {
        match_id:  mid,
        bracket:   'losers',
        round:     2 * j,
        index:     i,
        home:      null,
        away:      null,
        home_seed: null,
        away_seed: null,
        bye:       false,
        winner:    null,
        loser:     null,
        winner_to,
        loser_to:  null,
      };
      lrEvenMatches.push(m);
      matchMap[mid] = m;
    }
    lrRounds.push({ round: 2 * j, matches: lrEvenMatches });
  }

  // ── Wire WR loser_to → LR ─────────────────────────────────────────────────
  for (let r = 1; r <= k; r++) {
    const wrRound = wrRounds[r - 1];
    if (!wrRound) continue;

    for (let i = 0; i < wrRound.matches.length; i++) {
      const m = wrRound.matches[i];

      if (r === k) {
        // WR final loser → LB final (last even LR round), slot away
        const lbFinalMid = `LR${2 * (k - 1)}M1`;
        m.loser_to = matchMap[lbFinalMid] ? { match_id: lbFinalMid, slot: 'away' } : null;
      } else {
        // WR{r} losers drop into LR{2r-1}
        // Two WR losers feed into one LR match: first loser → away, second → home
        // Match index in LR: ceil((i+1)/2)
        const lrTargetRound = r === 1 ? 1 : 2 * r - 1;
        const lrMatchIdx    = Math.ceil((i + 1) / 2);
        const lrMid         = `LR${lrTargetRound}M${lrMatchIdx}`;
        // Alternate slots: odd i → away, even i → home (0-based)
        const slot = i % 2 === 0 ? 'away' : 'home';
        m.loser_to = matchMap[lrMid] ? { match_id: lrMid, slot } : null;
      }
    }
  }

  // ── Grand final ───────────────────────────────────────────────────────────
  const gf1 = {
    match_id:  'GF1',
    bracket:   'grand_final',
    round:     1,
    index:     1,
    home:      null,   // WR champion
    away:      null,   // LB champion
    home_seed: null,
    away_seed: null,
    bye:       false,
    winner:    null,
    loser:     null,
    winner_to: null,
    loser_to:  null,
  };
  const gf2 = {
    match_id:   'GF2',
    bracket:    'grand_final',
    round:      2,
    index:      1,
    home:       null,
    away:       null,
    home_seed:  null,
    away_seed:  null,
    bye:        false,
    winner:     null,
    loser:      null,
    winner_to:  null,
    loser_to:   null,
    conditional: true,
    required:    null,
  };
  matchMap['GF1'] = gf1;
  matchMap['GF2'] = gf2;

  // ── Apply provided results ────────────────────────────────────────────────
  for (const res of results) {
    // Accept both WR-prefixed and R-prefixed match IDs for convenience
    const mid = matchMap[res.match_id]
      ? res.match_id
      : res.match_id.replace(/^R(\d)/, 'WR$1');

    const m = matchMap[mid];
    if (!m) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `Unknown match_id: ${res.match_id}`, { fields: ['params.results'] });
    }
    const participants = [m.home, m.away].filter(Boolean);
    if (!participants.includes(res.winner)) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `Winner '${res.winner}' is not a participant of '${mid}'.`, { fields: ['params.results'] });
    }

    m.winner = res.winner;
    m.loser  = participants.find(t => t !== res.winner) ?? null;

    // Propagate winner
    if (m.winner_to) {
      const next = matchMap[m.winner_to.match_id];
      if (next) next[m.winner_to.slot] = res.winner;
    }
    // Propagate loser
    if (m.loser_to && m.loser) {
      const next = matchMap[m.loser_to.match_id];
      if (next) next[m.loser_to.slot] = m.loser;
    }
  }

  // ── GF2 required flag ─────────────────────────────────────────────────────
  // required becomes true only when LB champion wins GF1
  if (gf1.winner !== null) {
    const lbFinalMid  = `LR${2 * (k - 1)}M1`;
    const lbChampion  = matchMap[lbFinalMid]?.winner ?? null;
    // LB champion is GF1.away (fed from LB final winner → GF1 away slot)
    gf2.required = bracketReset && (gf1.winner === gf1.away) && (gf1.away === lbChampion);
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
