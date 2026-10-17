'use strict';

const fixturesService = require('../src/services/fixturesService');

// ─────────────────────────────────────────────────────────────────────────────
// ROUND ROBIN
// ─────────────────────────────────────────────────────────────────────────────
describe('Round Robin', () => {

  test('4 teams single leg — correct round/match counts', async () => {
    const r = await fixturesService.generate({ format: 'round_robin', teams: ['t1','t2','t3','t4'], params: { legs: 1 } });
    expect(r.round_count).toBe(3);           // n-1 for even n
    expect(r.rounds.length).toBe(3);
    expect(r.rounds[0].matches.length).toBe(2); // floor(n/2)
    expect(r.rounds[0].byes).toEqual([]);
    expect(r.summary.total).toBe(6);
    expect(r.summary.scheduled).toBe(6);
  });

  test('5 teams single leg — odd: 1 bye per round, correct rounds', async () => {
    const r = await fixturesService.generate({ format: 'round_robin', teams: ['t1','t2','t3','t4','t5'], params: { legs: 1 } });
    expect(r.round_count).toBe(5);           // n rounds for odd n
    expect(r.rounds.every(rnd => rnd.byes.length === 1)).toBe(true);
    // Each team gets exactly 1 bye total
    const byeCounts = {};
    for (const rnd of r.rounds) byeCounts[rnd.byes[0]] = (byeCounts[rnd.byes[0]] || 0) + 1;
    for (const t of ['t1','t2','t3','t4','t5']) expect(byeCounts[t]).toBe(1);
  });

  test('4 teams double legs — every ordered pair meets exactly once', async () => {
    const r = await fixturesService.generate({ format: 'round_robin', teams: ['t1','t2','t3','t4'], params: { legs: 2 } });
    expect(r.legs).toBe(2);
    expect(r.round_count).toBe(6);
    expect(r.summary.total).toBe(12);        // n*(n-1) for legs=2
    // Every ordered pair (home,away) appears exactly once
    const pairs = {};
    for (const rnd of r.rounds) {
      for (const m of rnd.matches) {
        const key = `${m.home}→${m.away}`;
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
    const teams = ['t1','t2','t3','t4'];
    for (const a of teams) {
      for (const b of teams) {
        if (a !== b) expect(pairs[`${a}→${b}`]).toBe(1);
      }
    }
  });

  test('each team plays exactly once per round (even)', async () => {
    const r = await fixturesService.generate({ format: 'round_robin', teams: ['t1','t2','t3','t4'], params: { legs: 1 } });
    for (const rnd of r.rounds) {
      const seen = new Set();
      for (const m of rnd.matches) {
        expect(seen.has(m.home)).toBe(false);
        expect(seen.has(m.away)).toBe(false);
        seen.add(m.home);
        seen.add(m.away);
      }
    }
  });

  test('forfeit_remaining withdrawal — fixtures after after_round get forfeit', async () => {
    const r = await fixturesService.generate({
      format: 'round_robin', teams: ['t1','t2','t3','t4'],
      params: { legs: 1, withdrawals: [{ team_id: 't3', after_round: 1 }], withdrawal_policy: 'forfeit_remaining' },
    });
    for (const rnd of r.rounds) {
      for (const m of rnd.matches) {
        const involvesT3 = m.home === 't3' || m.away === 't3';
        if (involvesT3 && rnd.round > 1) {
          expect(m.status).toBe('forfeit');
          expect(m.awarded_to).not.toBeNull();
          // awarded_to must be the opponent (not t3)
          expect(m.awarded_to).toBe(m.home === 't3' ? m.away : m.home);
        }
        if (involvesT3 && rnd.round <= 1) {
          expect(m.status).toBe('scheduled');
        }
      }
    }
  });

  test('void_all withdrawal — ALL fixtures involving team are voided', async () => {
    const r = await fixturesService.generate({
      format: 'round_robin', teams: ['t1','t2','t3','t4'],
      params: { legs: 1, withdrawals: [{ team_id: 't3', after_round: 2 }], withdrawal_policy: 'void_all' },
    });
    for (const rnd of r.rounds) {
      for (const m of rnd.matches) {
        if (m.home === 't3' || m.away === 't3') {
          expect(m.status).toBe('voided');
          expect(m.awarded_to).toBeNull();
        }
      }
    }
  });

  test('match IDs are unique and follow RR-L{leg}-R{round}-M{index} format', async () => {
    const r = await fixturesService.generate({ format: 'round_robin', teams: ['t1','t2','t3','t4'], params: { legs: 1 } });
    const ids = new Set();
    for (const rnd of r.rounds) {
      for (const m of rnd.matches) {
        expect(m.match_id).toMatch(/^RR-L\d+-R\d+-M\d+$/);
        expect(ids.has(m.match_id)).toBe(false);
        ids.add(m.match_id);
      }
    }
  });

  test('unknown team in withdrawal → 400', async () => {
    await expect(
      fixturesService.generate({
        format: 'round_robin', teams: ['t1','t2'],
        params: { withdrawals: [{ team_id: 'unknown', after_round: 1 }] },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('too many teams → 400', async () => {
    const teams = Array.from({ length: 41 }, (_, i) => `t${i}`);
    await expect(
      fixturesService.generate({ format: 'round_robin', teams, params: {} })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SWISS
// ─────────────────────────────────────────────────────────────────────────────
describe('Swiss', () => {

  test('round 1 exact pairing — 4 teams (even)', async () => {
    const r = await fixturesService.generate({
      format: 'swiss', teams: ['t1','t2','t3','t4'],
      params: { total_rounds: 3, round: 1, history: [] },
    });
    expect(r.format).toBe('swiss');
    expect(r.round).toBe(1);
    expect(r.pairings.length).toBe(2);
    expect(r.bye).toBeNull();
    // Round 1 exact: pair seed i with seed i+m (m=floor(n/2)=2)
    // teams[0]=t1 paired with teams[2]=t3, teams[1]=t2 paired with teams[3]=t4
    expect(r.pairings[0].home).toBe('t1');
    expect(r.pairings[0].away).toBe('t3');
    expect(r.pairings[1].home).toBe('t2');
    expect(r.pairings[1].away).toBe('t4');
  });

  test('round 1 — 5 teams (odd): last seed gets bye', async () => {
    const r = await fixturesService.generate({
      format: 'swiss', teams: ['t1','t2','t3','t4','t5'],
      params: { total_rounds: 3, round: 1, history: [] },
    });
    expect(r.bye).toBe('t5');  // last seed
    expect(r.pairings.length).toBe(2);
  });

  test('round 2 — no rematches', async () => {
    const r = await fixturesService.generate({
      format: 'swiss', teams: ['t1','t2','t3','t4'],
      params: {
        total_rounds: 3, round: 2,
        history: [{ round: 1, bye: null, matches: [
          { home: 't1', away: 't3', result: 'home' },
          { home: 't2', away: 't4', result: 'draw' },
        ]}],
      },
    });
    // No rematch
    for (const p of r.pairings) {
      const notRematch =
        !(p.home === 't1' && p.away === 't3') &&
        !(p.home === 't3' && p.away === 't1') &&
        !(p.home === 't2' && p.away === 't4') &&
        !(p.home === 't4' && p.away === 't2');
      expect(notRematch).toBe(true);
    }
  });

  test('standings reflect history before the round being paired', async () => {
    const r = await fixturesService.generate({
      format: 'swiss', teams: ['t1','t2','t3','t4'],
      params: {
        total_rounds: 3, round: 2,
        history: [{ round: 1, bye: null, matches: [
          { home: 't1', away: 't3', result: 'home' },
          { home: 't2', away: 't4', result: 'home' },
        ]}],
      },
    });
    // t1 and t2 won → score 1.0; t3 and t4 lost → score 0
    const t1 = r.standings.find(s => s.team_id === 't1');
    const t3 = r.standings.find(s => s.team_id === 't3');
    expect(t1.score).toBe(1);
    expect(t3.score).toBe(0);
  });

  test('bye counts as a win in standings', async () => {
    const r = await fixturesService.generate({
      format: 'swiss', teams: ['t1','t2','t3','t4','t5'],
      params: {
        total_rounds: 3, round: 2,
        history: [{ round: 1, bye: 't5', matches: [
          { home: 't1', away: 't3', result: 'home' },
          { home: 't2', away: 't4', result: 'home' },
        ]}],
      },
    });
    const t5 = r.standings.find(s => s.team_id === 't5');
    expect(t5.score).toBe(1); // bye = win
  });

  test('match IDs follow SW-R{round}-M{index}', async () => {
    const r = await fixturesService.generate({
      format: 'swiss', teams: ['t1','t2','t3','t4'],
      params: { total_rounds: 3, round: 1, history: [] },
    });
    for (const p of r.pairings) {
      expect(p.match_id).toMatch(/^SW-R1-M\d+$/);
    }
  });

  test('wrong history length → 400', async () => {
    await expect(
      fixturesService.generate({
        format: 'swiss', teams: ['t1','t2','t3','t4'],
        params: { total_rounds: 3, round: 2, history: [] }, // missing round 1
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE ELIMINATION
// ─────────────────────────────────────────────────────────────────────────────
describe('Single Elimination', () => {

  test('4 teams — bracket_size=4, 2 rounds, no byes', async () => {
    const r = await fixturesService.generate({ format: 'single_elim', teams: ['t1','t2','t3','t4'], params: {} });
    expect(r.bracket_size).toBe(4);
    expect(r.rounds.length).toBe(2);
    expect(r.rounds[0].matches.every(m => !m.bye)).toBe(true);
  });

  test('6 teams — bracket_size=8, exactly 2 bye matches in R1', async () => {
    const r = await fixturesService.generate({ format: 'single_elim', teams: ['t1','t2','t3','t4','t5','t6'], params: {} });
    expect(r.bracket_size).toBe(8);
    const byeMatches = r.rounds[0].matches.filter(m => m.bye);
    expect(byeMatches.length).toBe(2);
    // Bye matches have away=null and winner pre-filled
    for (const m of byeMatches) {
      expect(m.away).toBeNull();
      expect(m.winner).not.toBeNull();
    }
  });

  test('seed order n=6: R1M1=seed1 bye, R1M2=seed4 vs seed5', async () => {
    // order(8) = [1,8,4,5,2,7,3,6]
    // R1M1: seed1 vs seed8(missing) → bye
    // R1M2: seed4 vs seed5 → teams[3]=t4 vs teams[4]=t5
    const r = await fixturesService.generate({ format: 'single_elim', teams: ['t1','t2','t3','t4','t5','t6'], params: {} });
    const r1m1 = r.rounds[0].matches[0];
    const r1m2 = r.rounds[0].matches[1];
    expect(r1m1.bye).toBe(true);
    expect(r1m1.home).toBe('t1');
    expect(r1m1.away).toBeNull();
    expect(r1m2.home).toBe('t4');
    expect(r1m2.away).toBe('t5');
  });

  test('bye winner propagated to next round', async () => {
    const r = await fixturesService.generate({ format: 'single_elim', teams: ['t1','t2','t3','t4','t5','t6'], params: {} });
    // R1M1 bye winner (t1) should be in R2M1.home
    const r2m1 = r.rounds[1].matches[0];
    expect(r2m1.home).toBe('t1');
  });

  test('winner_to advancement: odd index → home, even index → away', async () => {
    const r = await fixturesService.generate({ format: 'single_elim', teams: ['t1','t2','t3','t4'], params: {} });
    const r1m1 = r.rounds[0].matches[0]; // index 1 (odd) → home slot
    const r1m2 = r.rounds[0].matches[1]; // index 2 (even) → away slot
    expect(r1m1.winner_to.slot).toBe('home');
    expect(r1m2.winner_to.slot).toBe('away');
    expect(r1m1.winner_to.match_id).toBe('R2M1');
    expect(r1m2.winner_to.match_id).toBe('R2M1');
  });

  test('final match has winner_to:null', async () => {
    const r = await fixturesService.generate({ format: 'single_elim', teams: ['t1','t2','t3','t4'], params: {} });
    const finalMatch = r.rounds[r.rounds.length - 1].matches[0];
    expect(finalMatch.winner_to).toBeNull();
  });

  test('third_place_match:true adds TP match', async () => {
    const r = await fixturesService.generate({ format: 'single_elim', teams: ['t1','t2','t3','t4'], params: { third_place_match: true } });
    const lastRound = r.rounds[r.rounds.length - 1].matches;
    const tp = lastRound.find(m => m.match_id === 'TP');
    expect(tp).toBeDefined();
    expect(tp.bracket).toBe('third_place');
  });

  test('results applied — winner propagated', async () => {
    // order(4) = [1,4,2,3] → R1M1: seed1(t1) vs seed4(t4)
    const r = await fixturesService.generate({
      format: 'single_elim', teams: ['t1','t2','t3','t4'],
      params: { results: [{ match_id: 'R1M1', winner: 't1' }] },
    });
    const r1m1 = r.rounds[0].matches[0];
    expect(r1m1.winner).toBe('t1');
    expect(r1m1.loser).toBe('t4');   // t4 is seed4, paired with t1(seed1) in R1M1
    // t1 propagated into R2M1.home
    const r2m1 = r.rounds[1].matches[0];
    expect(r2m1.home).toBe('t1');
  });

  test('unknown winner in results → 400', async () => {
    await expect(
      fixturesService.generate({
        format: 'single_elim', teams: ['t1','t2','t3','t4'],
        params: { results: [{ match_id: 'R1M1', winner: 'unknown' }] },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DOUBLE ELIMINATION
// ─────────────────────────────────────────────────────────────────────────────
describe('Double Elimination', () => {

  test('4 teams — has winners, losers, grand_final', async () => {
    const r = await fixturesService.generate({ format: 'double_elim', teams: ['t1','t2','t3','t4'], params: {} });
    expect(r.winners).toBeDefined();
    expect(r.losers).toBeDefined();
    expect(r.grand_final).toBeDefined();
  });

  test('bracket_reset:true — grand_final has 2 matches (GF1 + GF2)', async () => {
    const r = await fixturesService.generate({ format: 'double_elim', teams: ['t1','t2','t3','t4'], params: { bracket_reset: true } });
    expect(r.grand_final.length).toBe(2);
    expect(r.grand_final[1].match_id).toBe('GF2');
    expect(r.grand_final[1].conditional).toBe(true);
    expect(r.grand_final[1].required).toBeNull(); // no result yet
  });

  test('bracket_reset:false — grand_final has 1 match only', async () => {
    const r = await fixturesService.generate({ format: 'double_elim', teams: ['t1','t2','t3','t4'], params: { bracket_reset: false } });
    expect(r.grand_final.length).toBe(1);
    expect(r.grand_final[0].match_id).toBe('GF1');
  });

  test('WR match IDs use WR prefix', async () => {
    const r = await fixturesService.generate({ format: 'double_elim', teams: ['t1','t2','t3','t4'], params: {} });
    for (const rnd of r.winners) {
      for (const m of rnd.matches) {
        expect(m.match_id).toMatch(/^WR\d+M\d+$/);
      }
    }
  });

  test('LR match IDs use LR prefix', async () => {
    const r = await fixturesService.generate({ format: 'double_elim', teams: ['t1','t2','t3','t4'], params: {} });
    for (const rnd of r.losers) {
      for (const m of rnd.matches) {
        expect(m.match_id).toMatch(/^LR\d+M\d+$/);
      }
    }
  });

  test('all WR matches have loser_to except nothing — WR final loser goes to LB final', async () => {
    const r = await fixturesService.generate({ format: 'double_elim', teams: ['t1','t2','t3','t4'], params: {} });
    const wrFinalRound = r.winners[r.winners.length - 1];
    for (const rnd of r.winners) {
      for (const m of rnd.matches) {
        const isFinal = rnd.round === wrFinalRound.round;
        if (!isFinal) {
          // Non-final WR matches must have loser_to into LB
          expect(m.loser_to).not.toBeNull();
        } else {
          // WR final loser goes to LB final
          expect(m.loser_to).not.toBeNull();
          expect(m.loser_to.match_id).toMatch(/^LR/);
        }
      }
    }
  });

  test('8 teams — correct WR round count (k=3)', async () => {
    const r = await fixturesService.generate({ format: 'double_elim', teams: ['t1','t2','t3','t4','t5','t6','t7','t8'], params: {} });
    expect(r.bracket_size).toBe(8);
    expect(r.winners.length).toBe(3);    // k=3 WR rounds
    expect(r.losers.length).toBe(4);     // 2*(k-1)=4 LR rounds
  });

  test('fewer than 3 teams → 400', async () => {
    await expect(
      fixturesService.generate({ format: 'double_elim', teams: ['t1','t2'], params: {} })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
describe('Fixtures — validation', () => {

  test('unknown format → 400 VALIDATION_ERROR', async () => {
    await expect(
      fixturesService.generate({ format: 'bad_format', teams: ['t1','t2'], params: {} })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('duplicate team ids → 400 VALIDATION_ERROR', async () => {
    await expect(
      fixturesService.generate({ format: 'round_robin', teams: ['t1','t1'], params: {} })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('less than 2 teams → 400 VALIDATION_ERROR', async () => {
    await expect(
      fixturesService.generate({ format: 'round_robin', teams: ['t1'], params: {} })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });
});
