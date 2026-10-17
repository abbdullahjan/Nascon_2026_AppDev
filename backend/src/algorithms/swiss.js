'use strict';

const { AppError } = require('../utils/errors');

/**
 * Swiss-system pairing for one round.
 * Uses backtracking to find the minimum-score-difference pairing with no rematches.
 */
function generate(teams, params = {}) {
  const n            = teams.length;
  if (n < 2 || n > 64) throw new AppError(400, 'VALIDATION_ERROR', 'Swiss requires 2–64 teams.', { fields: ['teams'] });

  const defaultRounds = Math.ceil(Math.log2(n));
  const totalRounds   = params.total_rounds ?? defaultRounds;
  const round         = params.round        ?? 1;
  const history       = params.history      ?? [];

  if (round < 1 || round > totalRounds) {
    throw new AppError(400, 'VALIDATION_ERROR', `round must be between 1 and total_rounds (${totalRounds}).`, { fields: ['params.round'] });
  }
  if (history.length !== round - 1) {
    throw new AppError(400, 'VALIDATION_ERROR', `history must contain exactly rounds 1..${round - 1}.`, { fields: ['params.history'] });
  }

  // Compute standings from history
  const scores    = {};
  const buchholz  = {};
  const played    = {}; // team → Set of opponents

  for (const t of teams) {
    scores[t]   = 0;
    buchholz[t] = 0;
    played[t]   = new Set();
  }

  for (const histRound of history) {
    for (const m of histRound.matches) {
      played[m.home].add(m.away);
      played[m.away].add(m.home);
      if (m.result === 'home')  { scores[m.home] += 1; }
      else if (m.result === 'away') { scores[m.away] += 1; }
      else { scores[m.home] += 0.5; scores[m.away] += 0.5; }
    }
    if (histRound.bye) scores[histRound.bye] += 1; // bye counts as win
  }

  // Compute Buchholz
  for (const t of teams) {
    let buch = 0;
    for (const opp of played[t]) buch += scores[opp];
    buchholz[t] = buch;
  }

  // Sort by score desc, buchholz desc, seed (index in teams) asc
  const sorted = [...teams].sort((a, b) => {
    if (scores[b] !== scores[a])     return scores[b] - scores[a];
    if (buchholz[b] !== buchholz[a]) return buchholz[b] - buchholz[a];
    return teams.indexOf(a) - teams.indexOf(b);
  });

  const standings = sorted.map((t, i) => ({
    rank: i + 1, team_id: t,
    score: scores[t], buchholz: buchholz[t],
  }));

  // Round 1: exact pairing
  if (round === 1) {
    const m = Math.floor(n / 2);
    const byeTeam = n % 2 !== 0 ? sorted[sorted.length - 1] : null;
    const active  = byeTeam ? sorted.slice(0, -1) : sorted;
    const pairings = [];
    for (let i = 0; i < m; i++) {
      pairings.push({
        match_id: `SW-R1-M${i + 1}`,
        home: active[i],
        away: active[i + m],
      });
    }
    return { format: 'swiss', round: 1, total_rounds: totalRounds, pairings, bye: byeTeam, standings };
  }

  // Rounds >= 2: backtracking pairing
  const hadBye = new Set();
  for (const hr of history) { if (hr.bye) hadBye.add(hr.bye); }

  // Determine bye candidate: lowest-scoring team that has not had a bye
  const byeCandidates = sorted.filter(t => !hadBye.has(t)).reverse(); // lowest score first

  if (n % 2 === 0) {
    // Even — no bye needed
    const pairings = backtrack(sorted, played, scores);
    if (!pairings) throw new AppError(409, 'NO_VALID_PAIRING', 'No rematch-free pairing exists for this round.', { round });
    return { format: 'swiss', round, total_rounds: totalRounds, pairings: pairings.map((p,i) => ({ match_id: `SW-R${round}-M${i+1}`, ...p })), bye: null, standings };
  }

  // Odd — try each bye candidate
  for (const byeTeam of byeCandidates) {
    const remaining = sorted.filter(t => t !== byeTeam);
    const pairings  = backtrack(remaining, played, scores);
    if (pairings) {
      return {
        format: 'swiss', round, total_rounds: totalRounds,
        pairings: pairings.map((p, i) => ({ match_id: `SW-R${round}-M${i+1}`, ...p })),
        bye: byeTeam, standings,
      };
    }
  }

  throw new AppError(409, 'NO_VALID_PAIRING', 'No rematch-free pairing exists for any bye candidate.', { round });
}

/**
 * Backtracking pairing: minimise sum of |score differences|.
 * Returns array of {home, away} or null if no valid pairing exists.
 */
function backtrack(teams, played, scores) {
  if (teams.length === 0) return [];
  const [first, ...rest] = teams;

  for (const opp of rest) {
    if (played[first].has(opp)) continue;
    const remaining = rest.filter(t => t !== opp);
    const sub = backtrack(remaining, played, scores);
    if (sub !== null) {
      return [{ home: first, away: opp }, ...sub];
    }
  }
  return null;
}

module.exports = { generate };
