'use strict';

process.env.DAY1_SALT = 'demo-salt';

// ── Mock DB (state must live inside the factory) ───────────────────────────
jest.mock('../src/config/db', () => {
  const sports = {
    football: {
      sport_id: 'football', name: 'Football', scoring_model: 'event',
      config: JSON.stringify({
        sport_id: 'football', scoring_model: 'event',
        tie_break_order: ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'],
      }),
    },
  };
  const leagues   = {};
  const matches   = {};
  const appConfig = { lots_seed: '42' };

  const mockDb = jest.fn((table) => ({
    where: (q) => ({
      first: async () => {
        if (table === 'sports')     return sports[q.sport_id]    || null;
        if (table === 'leagues')    return leagues[q.league_id]  || null;
        if (table === 'matches')    return matches[q.match_id]   || null;
        if (table === 'app_config') return appConfig[q.key] !== undefined ? { value: appConfig[q.key] } : null;
        return null;
      },
    }),
    insert: async (row) => {
      if (table === 'leagues') leagues[row.league_id] = row;
      if (table === 'matches') matches[row.match_id]   = row;
    },
    count: () => ({ first: async () => ({ cnt: 0 }) }),
  }));

  mockDb.transaction = async (fn) => {
    const trx = mockDb;
    await fn(trx);
  };
  mockDb.raw = async () => {};

  // Expose internal state for test assertions + cleanup
  mockDb.__state = { sports, leagues, matches, appConfig };

  return mockDb;
});

const leaguesService = require('../src/services/leaguesService');
const db = require('../src/config/db');

beforeEach(() => {
  for (const k of Object.keys(db.__state.leagues)) delete db.__state.leagues[k];
  for (const k of Object.keys(db.__state.matches)) delete db.__state.matches[k];
  db.__state.appConfig.lots_seed = '42';
});

describe('League Registration', () => {

  test('valid league → created with correct counts', async () => {
    const r = await leaguesService.createLeague({
      league_id: 'lg-1', sport_id: 'football',
      teams: ['t1','t2','t3','t4'],
      fixtures: [
        { match_id: 'm1', home: 't1', away: 't2' },
        { match_id: 'm2', home: 't3', away: 't4' },
      ],
      qualification: { spots: 2 },
    });
    expect(r.status).toBe('created');
    expect(r.league_id).toBe('lg-1');
    expect(r.team_count).toBe(4);
    expect(r.fixture_count).toBe(2);
  });

  test('missing league_id → 400', async () => {
    await expect(
      leaguesService.createLeague({ sport_id: 'football', teams: ['t1','t2'], fixtures: [], qualification: { spots: 1 } })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('missing sport_id → 400', async () => {
    await expect(
      leaguesService.createLeague({ league_id: 'lg', teams: ['t1','t2'], fixtures: [], qualification: { spots: 1 } })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('unknown sport → 404 SPORT_NOT_FOUND', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-x', sport_id: 'unknown_sport',
        teams: ['t1','t2'], fixtures: [], qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'SPORT_NOT_FOUND' });
  });

  test('duplicate league → 409 LEAGUE_EXISTS', async () => {
    await leaguesService.createLeague({
      league_id: 'lg-dup', sport_id: 'football',
      teams: ['t1','t2'], fixtures: [], qualification: { spots: 1 },
    });
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-dup', sport_id: 'football',
        teams: ['t1','t2'], fixtures: [], qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'LEAGUE_EXISTS' });
  });

  test('duplicate match_id in DB → 409 MATCH_EXISTS', async () => {
    db.__state.matches['m-dup'] = { match_id: 'm-dup' };
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-2', sport_id: 'football',
        teams: ['t1','t2'],
        fixtures: [{ match_id: 'm-dup', home: 't1', away: 't2' }],
        qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'MATCH_EXISTS' });
  });

  test('duplicate match_id in same request → 409 MATCH_EXISTS', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-3', sport_id: 'football',
        teams: ['t1','t2'],
        fixtures: [
          { match_id: 'm-same', home: 't1', away: 't2' },
          { match_id: 'm-same', home: 't1', away: 't2' },
        ],
        qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'MATCH_EXISTS' });
  });

  test('fixture team not in teams list → 400', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-4', sport_id: 'football',
        teams: ['t1','t2'],
        fixtures: [{ match_id: 'm1', home: 't1', away: 't3' }],
        qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('home === away → 400', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-5', sport_id: 'football',
        teams: ['t1','t2'],
        fixtures: [{ match_id: 'm1', home: 't1', away: 't1' }],
        qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('qualification.spots > teams.length → 400', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-6', sport_id: 'football',
        teams: ['t1','t2'], fixtures: [],
        qualification: { spots: 5 },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('qualification.spots < 1 → 400', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-7', sport_id: 'football',
        teams: ['t1','t2'], fixtures: [],
        qualification: { spots: 0 },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('duplicate team ids → 400', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-8', sport_id: 'football',
        teams: ['t1','t1'], fixtures: [],
        qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('less than 2 teams → 400', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-9', sport_id: 'football',
        teams: ['t1'], fixtures: [],
        qualification: { spots: 1 },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('default points = win:3, draw:1, loss:0', async () => {
    await leaguesService.createLeague({
      league_id: 'lg-def', sport_id: 'football',
      teams: ['t1','t2'], fixtures: [],
      qualification: { spots: 1 },
    });
    const config = JSON.parse(db.__state.leagues['lg-def'].config);
    expect(config.points).toEqual({ win: 3, draw: 1, loss: 0 });
  });

  test('custom points stored correctly', async () => {
    await leaguesService.createLeague({
      league_id: 'lg-cust', sport_id: 'football',
      teams: ['t1','t2'], fixtures: [],
      points: { win: 2, draw: 1, loss: 0 },
      qualification: { spots: 1 },
    });
    const config = JSON.parse(db.__state.leagues['lg-cust'].config);
    expect(config.points).toEqual({ win: 2, draw: 1, loss: 0 });
  });

  test('lots_seed defaults from app_config', async () => {
    db.__state.appConfig.lots_seed = '99';
    await leaguesService.createLeague({
      league_id: 'lg-seed', sport_id: 'football',
      teams: ['t1','t2'], fixtures: [],
      qualification: { spots: 1 },
    });
    const config = JSON.parse(db.__state.leagues['lg-seed'].config);
    expect(config.lots_seed).toBe(99);
  });

  test('lots_seed explicitly provided overrides default', async () => {
    await leaguesService.createLeague({
      league_id: 'lg-seed2', sport_id: 'football',
      teams: ['t1','t2'], fixtures: [],
      qualification: { spots: 1 },
      lots_seed: 77,
    });
    const config = JSON.parse(db.__state.leagues['lg-seed2'].config);
    expect(config.lots_seed).toBe(77);
  });

  test('tie_break_order defaults to sport config with draw_lots last', async () => {
    await leaguesService.createLeague({
      league_id: 'lg-tbo', sport_id: 'football',
      teams: ['t1','t2'], fixtures: [],
      qualification: { spots: 1 },
    });
    const config = JSON.parse(db.__state.leagues['lg-tbo'].config);
    expect(config.tie_break_order[config.tie_break_order.length - 1]).toBe('draw_lots');
  });

  test('invalid tie_break_order token → 400', async () => {
    await expect(
      leaguesService.createLeague({
        league_id: 'lg-bad-tbo', sport_id: 'football',
        teams: ['t1','t2'], fixtures: [],
        qualification: { spots: 1 },
        tie_break_order: ['h2h_points', 'invalid_token'],
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('matches created with status upcoming', async () => {
    await leaguesService.createLeague({
      league_id: 'lg-matches', sport_id: 'football',
      teams: ['t1','t2'],
      fixtures: [{ match_id: 'mk1', home: 't1', away: 't2' }],
      qualification: { spots: 1 },
    });
    expect(db.__state.matches['mk1'].status).toBe('upcoming');
    expect(db.__state.matches['mk1'].home_team).toBe('t1');
    expect(db.__state.matches['mk1'].away_team).toBe('t2');
  });
});
