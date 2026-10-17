'use strict';

const { AppError } = require('../utils/errors');

/**
 * Round-robin fixture generation using the circle method.
 * Supports single/double legs, odd team counts (byes), and withdrawals.
 */
function generate(teams, params = {}) {
  const n = teams.length;
  if (n < 2 || n > 40) throw new AppError(400, 'VALIDATION_ERROR', 'Round-robin requires 2–40 teams.', { fields: ['teams'] });

  const legs              = params.legs ?? 1;
  const withdrawals       = params.withdrawals ?? [];
  const withdrawalPolicy  = params.withdrawal_policy ?? 'forfeit_remaining';

  if (legs !== 1 && legs !== 2) throw new AppError(400, 'VALIDATION_ERROR', 'legs must be 1 or 2.', { fields: ['params.legs'] });

  // Build withdrawal map: team_id → after_round
  const withdrawMap = {};
  for (const w of withdrawals) {
    if (!teams.includes(w.team_id)) throw new AppError(400, 'VALIDATION_ERROR', `Unknown team in withdrawal: ${w.team_id}`, { fields: ['params.withdrawals'] });
    withdrawMap[w.team_id] = w.after_round;
  }

  const isOdd      = n % 2 !== 0;
  const padded     = isOdd ? [...teams, 'BYE'] : [...teams];
  const N          = padded.length;
  const roundsPerLeg = N - 1;
  const totalRounds  = roundsPerLeg * legs;

  // Validate after_round values
  for (const w of withdrawals) {
    if (w.after_round < 0 || w.after_round > totalRounds) {
      throw new AppError(400, 'VALIDATION_ERROR', `after_round ${w.after_round} out of range 0..${totalRounds}`, { fields: ['params.withdrawals'] });
    }
  }

  const allRounds = [];
  let   matchIndex = 1;

  for (let leg = 1; leg <= legs; leg++) {
    const rotation = [...padded];

    for (let r = 0; r < roundsPerLeg; r++) {
      const globalRound = (leg - 1) * roundsPerLeg + r + 1;
      const matches     = [];
      const byeTeams    = [];

      for (let i = 0; i < N / 2; i++) {
        const t1 = rotation[i];
        const t2 = rotation[N - 1 - i];

        if (t1 === 'BYE' || t2 === 'BYE') {
          const realTeam = t1 === 'BYE' ? t2 : t1;
          byeTeams.push(realTeam);
          continue;
        }

        // Home/away: lower index in original teams list is home (circle method parity)
        const home = teams.indexOf(t1) < teams.indexOf(t2) ? t1 : t2;
        const away = home === t1 ? t2 : t1;

        const wdrawn1 = withdrawMap[t1] !== undefined && globalRound > withdrawMap[t1];
        const wdrawn2 = withdrawMap[t2] !== undefined && globalRound > withdrawMap[t2];

        let status      = 'scheduled';
        let awarded_to  = null;

        if (withdrawalPolicy === 'void_all' && (withdrawMap[t1] !== undefined || withdrawMap[t2] !== undefined)) {
          status = 'voided';
        } else if (wdrawn1 && wdrawn2) {
          status = 'voided';
        } else if (wdrawn1) {
          status = 'forfeit'; awarded_to = away;
        } else if (wdrawn2) {
          status = 'forfeit'; awarded_to = home;
        }

        matches.push({
          match_id:   `RR-L${leg}-R${globalRound}-M${matchIndex++}`,
          leg,
          home,
          away,
          status,
          awarded_to,
        });
      }

      // Rotate: fix first element, rotate the rest
      const fixed = rotation[0];
      const rest  = rotation.slice(1);
      rest.unshift(rest.pop());
      rotation.splice(0, N, fixed, ...rest);

      allRounds.push({ round: globalRound, matches, byes: byeTeams });
    }
  }

  const scheduled = allRounds.flatMap(r => r.matches).filter(m => m.status === 'scheduled').length;
  const forfeit   = allRounds.flatMap(r => r.matches).filter(m => m.status === 'forfeit').length;
  const voided    = allRounds.flatMap(r => r.matches).filter(m => m.status === 'voided').length;
  const total     = scheduled + forfeit + voided;

  return {
    format:       'round_robin',
    legs,
    team_count:   n,
    round_count:  totalRounds,
    rounds:       allRounds,
    summary:      { total, scheduled, forfeit, voided },
  };
}

module.exports = { generate };
