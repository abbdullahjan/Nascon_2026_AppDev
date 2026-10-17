'use strict';

const { AppError } = require('../utils/errors');

/**
 * Round-robin fixture generation using the circle method.
 * Supports single/double legs, odd team counts (byes), and withdrawals.
 *
 * Circle method home/away:
 *   - Fix position 0, rotate positions 1..N-1 counter-clockwise each round.
 *   - Pair position i with position N-1-i.
 *   - In odd rounds: position-0 team is home when paired with position N-1.
 *   - In even rounds: position-0 team is away.
 *   - For all other pairs: lower original seed index = home.
 *   - In leg 2, flip all home/away assignments to guarantee every ordered pair meets once.
 */
function generate(teams, params = {}) {
  const n = teams.length;
  if (n < 2 || n > 40) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Round-robin requires 2–40 teams.', { fields: ['teams'] });
  }

  const legs             = params.legs ?? 1;
  const withdrawals      = params.withdrawals ?? [];
  const withdrawalPolicy = params.withdrawal_policy ?? 'forfeit_remaining';

  if (legs !== 1 && legs !== 2) {
    throw new AppError(400, 'VALIDATION_ERROR', 'legs must be 1 or 2.', { fields: ['params.legs'] });
  }

  // Build withdrawal map: team_id → after_round (the last round they still play)
  const withdrawMap = {};
  for (const w of withdrawals) {
    if (!teams.includes(w.team_id)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown team in withdrawal: ${w.team_id}`, { fields: ['params.withdrawals'] });
    }
    withdrawMap[w.team_id] = w.after_round;
  }

  const isOdd        = n % 2 !== 0;
  const padded       = isOdd ? [...teams, 'BYE'] : [...teams];
  const N            = padded.length;        // always even
  const roundsPerLeg = N - 1;
  const totalRounds  = roundsPerLeg * legs;

  // Validate after_round values
  for (const w of withdrawals) {
    if (w.after_round < 0 || w.after_round > totalRounds) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `after_round ${w.after_round} out of range 0..${totalRounds}`,
        { fields: ['params.withdrawals'] });
    }
  }

  const allRounds = [];

  for (let leg = 1; leg <= legs; leg++) {
    // Reset rotation at the start of each leg
    const rotation = [...padded];

    for (let r = 0; r < roundsPerLeg; r++) {
      const globalRound  = (leg - 1) * roundsPerLeg + r + 1;
      const roundMatches = [];
      const byeTeams     = [];

      for (let i = 0; i < N / 2; i++) {
        const t1 = rotation[i];
        const t2 = rotation[N - 1 - i];

        // Handle bye slot
        if (t1 === 'BYE' || t2 === 'BYE') {
          const realTeam = t1 === 'BYE' ? t2 : t1;
          byeTeams.push(realTeam);
          continue;
        }

        // Determine home/away for this leg
        // i=0 pairs the fixed team — alternate home/away by round parity
        // All other pairs: lower original index = home in leg 1, flipped in leg 2
        let home, away;
        if (i === 0) {
          // Fixed team (rotation[0]) vs rotation[N-1]
          if (leg === 1) {
            home = (r % 2 === 0) ? t1 : t2;
            away = home === t1 ? t2 : t1;
          } else {
            // Leg 2: flip
            home = (r % 2 === 0) ? t2 : t1;
            away = home === t1 ? t2 : t1;
          }
        } else {
          const idx1 = teams.indexOf(t1);
          const idx2 = teams.indexOf(t2);
          if (leg === 1) {
            home = idx1 < idx2 ? t1 : t2;
            away = home === t1 ? t2 : t1;
          } else {
            // Leg 2: flip home/away
            home = idx1 < idx2 ? t2 : t1;
            away = home === t1 ? t2 : t1;
          }
        }

        // Determine status based on withdrawal policy
        const withdrawn1 = withdrawMap[t1] !== undefined;
        const withdrawn2 = withdrawMap[t2] !== undefined;
        const wdrawn1    = withdrawn1 && globalRound > withdrawMap[t1];
        const wdrawn2    = withdrawn2 && globalRound > withdrawMap[t2];

        let status     = 'scheduled';
        let awarded_to = null;

        if (withdrawalPolicy === 'void_all') {
          // void_all: void ALL fixtures involving a withdrawn team (any round)
          if (withdrawn1 || withdrawn2) {
            status = 'voided';
          }
        } else {
          // forfeit_remaining: only fixtures after after_round are affected
          if (wdrawn1 && wdrawn2) {
            status = 'voided';
          } else if (wdrawn1) {
            // t1 (the loop variable) withdrew — award to the OTHER team
            status = 'forfeit';
            awarded_to = home === t1 ? away : home;
          } else if (wdrawn2) {
            // t2 (the loop variable) withdrew — award to the OTHER team
            status = 'forfeit';
            awarded_to = home === t2 ? away : home;
          }
        }

        // Match ID: index within this round (1-based)
        const matchIndexInRound = roundMatches.length + 1;
        roundMatches.push({
          match_id:  `RR-L${leg}-R${globalRound}-M${matchIndexInRound}`,
          leg,
          home,
          away,
          status,
          awarded_to,
        });
      }

      // Circle method rotation: fix index 0, rotate rest counter-clockwise
      const fixed = rotation[0];
      const rest  = rotation.slice(1);
      rest.unshift(rest.pop()); // move last element to front
      rotation.splice(0, N, fixed, ...rest);

      allRounds.push({ round: globalRound, matches: roundMatches, byes: byeTeams });
    }
  }

  const allMatches = allRounds.flatMap(r => r.matches);
  const scheduled  = allMatches.filter(m => m.status === 'scheduled').length;
  const forfeit    = allMatches.filter(m => m.status === 'forfeit').length;
  const voided     = allMatches.filter(m => m.status === 'voided').length;
  const total      = scheduled + forfeit + voided;

  return {
    format:      'round_robin',
    legs,
    team_count:  n,
    round_count: totalRounds,
    rounds:      allRounds,
    summary:     { total, scheduled, forfeit, voided },
  };
}

module.exports = { generate };
