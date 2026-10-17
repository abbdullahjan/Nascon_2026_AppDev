'use strict';

const fixturesService = require('../src/services/fixturesService');

describe('Fixture Algorithms', () => {

  describe('Round Robin', () => {
    test('even teams — correct round and match count', async () => {
      const result = await fixturesService.generate({
        format: 'round_robin',
        teams:  ['t1','t2','t3','t4'],
        params: { legs: 1 },
      });
      expect(result.round_count).toBe(3);       // n-1 for even n
      expect(result.team_count).toBe(4);
      expect(result.rounds.length).toBe(3);
      expect(result.rounds[0].matches.length).toBe(2); // floor(n/2)
    });

    test('odd teams — one bye per round', async () => {
      const result = await fixturesService.generate({
        format: 'round_robin',
        teams:  ['t1','t2','t3'],
        params: { legs: 1 },
      });
      expect(result.round_count).toBe(3);       // n rounds for odd n
      for (const round of result.rounds) {
        expect(round.byes.length).toBe(1);
      }
    });

    test('double legs — every ordered pair meets exactly once', async () => {
      const result = await fixturesService.generate({
        format: 'round_robin',
        teams:  ['t1','t2','t3','t4'],
        params: { legs: 2 },
      });
      expect(result.legs).toBe(2);
      expect(result.summary.total).toBe(12); // n*(n-1) for legs=2
    });
  });

  describe('Single Elimination', () => {
    test('4 teams — bracket size 4, 2 rounds', async () => {
      const result = await fixturesService.generate({
        format: 'single_elim',
        teams:  ['t1','t2','t3','t4'],
        params: {},
      });
      expect(result.bracket_size).toBe(4);
      expect(result.rounds.length).toBe(2);
    });

    test('6 teams — bracket size 8 with byes', async () => {
      const result = await fixturesService.generate({
        format: 'single_elim',
        teams:  ['t1','t2','t3','t4','t5','t6'],
        params: {},
      });
      expect(result.bracket_size).toBe(8);
      const byeMatches = result.rounds[0].matches.filter(m => m.bye === true);
      expect(byeMatches.length).toBe(2);
    });
  });

  describe('Double Elimination', () => {
    test('4 teams — has winners, losers, and grand_final', async () => {
      const result = await fixturesService.generate({
        format: 'double_elim',
        teams:  ['t1','t2','t3','t4'],
        params: { bracket_reset: true },
      });
      expect(result.winners).toBeDefined();
      expect(result.losers).toBeDefined();
      expect(result.grand_final).toBeDefined();
      expect(result.grand_final.length).toBe(2); // GF1 + GF2 when bracket_reset=true
    });
  });

  describe('Validation', () => {
    test('unknown format → 400', async () => {
      await expect(
        fixturesService.generate({ format: 'invalid', teams: ['t1','t2'], params: {} })
      ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
    });

    test('duplicate team ids → 400', async () => {
      await expect(
        fixturesService.generate({ format: 'round_robin', teams: ['t1','t1'], params: {} })
      ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
    });
  });
});
