'use strict';

process.env.DAY1_SALT = 'demo-salt';

const sportsService = require('../src/services/sportsService');

// Mock DB to avoid needing a real PostgreSQL in unit tests
jest.mock('../src/config/db', () => {
  const store = {};
  const mock  = (table) => ({
    where:  (q) => ({ first: async () => store[table]?.[q.sport_id] || null }),
    insert: async (row) => { store[table] = store[table] || {}; store[table][row.sport_id] = row; },
  });
  mock.raw = async () => {};
  return mock;
});

describe('Sports Service', () => {
  test('valid event-model sport → created', async () => {
    const result = await sportsService.createSport({
      sport_id:       'kabaddi',
      name:           'Kabaddi',
      scoring_model:  'event',
      periods:        { count: 2, duration_minutes: 20 },
      scoring_events: { raid_point: { points: 1 } },
      draw_allowed:   false,
      overtime:       { policy: 'golden_score', duration_minutes: 5 },
      roster:         { min_squad_size: 7, max_squad_size: 12, required_positions: {} },
    });
    expect(result.status).toBe('created');
    expect(result.sport_id).toBe('kabaddi');
  });

  test('invalid sport_id (uppercase) → VALIDATION_ERROR', async () => {
    await expect(
      sportsService.createSport({
        sport_id: 'INVALID',
        name: 'Test', scoring_model: 'event',
        periods: { count: 2, duration_minutes: 10 },
        scoring_events: { point: { points: 1 } },
        draw_allowed: false,
        overtime: { policy: 'none' },
        roster: { min_squad_size: 2, max_squad_size: 5, required_positions: {} },
      })
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  test('invalid scoring_model → VALIDATION_ERROR', async () => {
    await expect(
      sportsService.createSport({
        sport_id: 'test2', name: 'Test', scoring_model: 'unknown',
        periods: { count: 1, duration_minutes: 10 },
        scoring_events: { pt: { points: 1 } },
        draw_allowed: false, overtime: { policy: 'none' },
        roster: { min_squad_size: 1, max_squad_size: 5, required_positions: {} },
      })
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  test('draw_lots always appended last in tie_break_order', async () => {
    const result = await sportsService.createSport({
      sport_id:       'test3',
      name:           'Test3',
      scoring_model:  'event',
      periods:        { count: 1, duration_minutes: 10 },
      scoring_events: { pt: { points: 1 } },
      draw_allowed:   true,
      overtime:       { policy: 'none' },
      tie_break_order: ['h2h_points', 'scored'],
      roster:         { min_squad_size: 1, max_squad_size: 5, required_positions: {} },
    });
    const tbo = result.config.tie_break_order;
    expect(tbo[tbo.length - 1]).toBe('draw_lots');
  });
});
