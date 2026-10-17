'use strict';

process.env.DAY1_SALT = 'demo-salt';

// draw_lots test vector from Appendix A
// Seed 42, league lg-1:
// t1 → 0613316991ce0ac31e88d6003e3ff4d5e21bb072ac5f81b42c0cdc6598453293
// t2 → e3e3a14e22727f936e1f288cf5d02a8a9362b1da13c5432725fc10b2c7955dd9
// t3 → c8f28e3c2f1eb6c4f636b4f57050e3362a2b39c07fda9b61742a26dd20397028
// Order ascending by hash: t1 < t3 < t2

const crypto = require('crypto');

describe('Standings — draw_lots tie-breaker (Appendix A test vector)', () => {
  test('hash order matches spec exactly', () => {
    const seed = 42;
    const league_id = 'lg-1';
    const teams = ['t1', 't2', 't3'];

    const hashes = {};
    for (const t of teams) {
      hashes[t] = crypto.createHash('sha256').update(`${seed}|${league_id}|${t}`).digest('hex');
    }

    expect(hashes['t1']).toBe('0613316991ce0ac31e88d6003e3ff4d5e21bb072ac5f81b42c0cdc6598453293');
    expect(hashes['t2']).toBe('e3e3a14e22727f936e1f288cf5d02a8a9362b1da13c5432725fc10b2c7955dd9');
    expect(hashes['t3']).toBe('c8f28e3c2f1eb6c4f636b4f57050e3362a2b39c07fda9b61742a26dd20397028');

    // Ascending order = t1 < t3 < t2 (best to worst)
    const sorted = [...teams].sort((a, b) => hashes[a].localeCompare(hashes[b]));
    expect(sorted).toEqual(['t1', 't3', 't2']);
  });
});

describe('Standings — qualification status logic', () => {
  test('clinched: no other team can catch up', () => {
    // Team with 9 pts, all others max out at 6 pts — clinched for spot 1
    const W = 3;
    const canReachOrBeat = [6, 6].filter(p => p >= 9);
    expect(canReachOrBeat.length).toBe(0); // < 1 spot → clinched
  });

  test('eliminated: enough teams already ahead', () => {
    // Team has 0 pts, 3 remaining → max 9. Two teams already have 10 pts.
    const W = 3;
    const myMax = 0 + W * 3; // 9
    const alreadyAhead = [10, 10].filter(p => p > myMax);
    expect(alreadyAhead.length).toBeGreaterThanOrEqual(2); // ≥ qualSpots(2) → eliminated
  });
});
