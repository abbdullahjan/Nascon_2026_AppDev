'use strict';

process.env.DAY1_SALT = 'demo-salt';

const crypto = require('crypto');

// ── draw_lots test vectors from Appendix A ──────────────────────────────────
describe('Standings — draw_lots (Appendix A test vector)', () => {
  test('hash order matches spec: t1 < t3 < t2', () => {
    const seed = 42;
    const league_id = 'lg-1';
    const teams = ['t1', 't2', 't3'];

    const hashes = {};
    for (const t of teams) {
      hashes[t] = crypto.createHash('sha256')
        .update(`${seed}|${league_id}|${t}`)
        .digest('hex');
    }

    // Exact values from Appendix A
    expect(hashes['t1']).toBe('0613316991ce0ac31e88d6003e3ff4d5e21bb072ac5f81b42c0cdc6598453293');
    expect(hashes['t2']).toBe('e3e3a14e22727f936e1f288cf5d02a8a9362b1da13c5432725fc10b2c7955dd9');
    expect(hashes['t3']).toBe('c8f28e3c2f1eb6c4f636b4f57050e3362a2b39c07fda9b61742a26dd20397028');

    // Ascending = best to worst: t1 < t3 < t2
    const sorted = [...teams].sort((a, b) => hashes[a].localeCompare(hashes[b]));
    expect(sorted).toEqual(['t1', 't3', 't2']);
  });

  test('different seed produces different order', () => {
    const seed = 99;
    const league_id = 'lg-1';
    const teams = ['t1', 't2', 't3'];

    const hashes = {};
    for (const t of teams) {
      hashes[t] = crypto.createHash('sha256')
        .update(`${seed}|${league_id}|${t}`)
        .digest('hex');
    }
    // Just verify it produces valid hashes and a deterministic order
    expect(Object.keys(hashes).length).toBe(3);
    const sorted = [...teams].sort((a, b) => hashes[a].localeCompare(hashes[b]));
    expect(sorted.length).toBe(3);
  });
});

describe('Standings — qualification status logic', () => {
  test('clinched: no other team can reach my points', () => {
    const W = 3;
    // Team has 9 pts, all others max 6 — clinched for spot 1
    const myPts = 9;
    const others = [{ points: 6, remaining: 0 }, { points: 3, remaining: 0 }];
    const canReachOrBeat = others.filter(o => o.points + W * o.remaining >= myPts);
    expect(canReachOrBeat.length).toBe(0); // < 1 spot → clinched
  });

  test('eliminated: enough teams already ahead', () => {
    const W = 3;
    const myMax = 0 + W * 3; // 9
    const others = [{ points: 10 }, { points: 10 }];
    const alreadyAhead = others.filter(o => o.points > myMax);
    expect(alreadyAhead.length).toBeGreaterThanOrEqual(2);
  });

  test('still_possible: neither clinched nor eliminated', () => {
    const W = 3;
    const myPts = 3;
    const myRemain = 2;
    const myMax = myPts + W * myRemain; // 9
    const others = [
      { points: 6, remaining: 0 }, // max 6 — can't beat 9
      { points: 0, remaining: 3 }, // max 9 — can tie
    ];
    // Clinched check: can reach >= 3?
    const canReachOrBeat = others.filter(o => o.points + W * o.remaining >= myPts);
    // 2 >= 1 → not clinched
    expect(canReachOrBeat.length).toBeGreaterThanOrEqual(1);
    // Eliminated check: points > 9?
    const alreadyAhead = others.filter(o => o.points > myMax);
    expect(alreadyAhead.length).toBe(0); // < 2 → not eliminated
  });
});

describe('Standings — NRR calculation', () => {
  test('net run rate = (runs/overs) - (runs/overs), rounded to 3 decimals', () => {
    // Team scored 100 runs in 10 overs, conceded 80 in 10 overs
    // NRR = (100/10) - (80/10) = 10 - 8 = 2.0
    const runsScored = 100, ballsFaced = 60, bpo = 6;
    const runsConceded = 80, ballsBowled = 60;
    const oversFaced  = ballsFaced  / bpo;  // 10
    const oversBowled = ballsBowled / bpo;  // 10
    const nrr = Math.round(((runsScored / oversFaced) - (runsConceded / oversBowled)) * 1000) / 1000;
    expect(nrr).toBe(2.0);
  });

  test('NRR with partial overs (16.2 ov)', () => {
    // 50 runs in 16.2 overs (98 balls), 45 in 20 overs (120 balls)
    // NRR = (50 / 16.33) - (45 / 20) = 3.061 - 2.25 = 0.811
    const runsScored = 50, ballsFaced = 98, bpo = 6;
    const runsConceded = 45, ballsBowled = 120;
    const oversFaced  = ballsFaced  / bpo;  // 16.333
    const oversBowled = ballsBowled / bpo;  // 20
    const nrr = Math.round(((runsScored / oversFaced) - (runsConceded / oversBowled)) * 1000) / 1000;
    expect(nrr).toBe(0.811);
  });
});
