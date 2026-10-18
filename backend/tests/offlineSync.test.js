'use strict';

// ── Mock DB (state inside factory) ──────────────────────────────────────────
jest.mock('../src/config/db', () => {
  const state = {
    matches: {},
    matchEvents: {},
    rosterAudit: {},
    offlineRequests: {},
    offlineResults: {},
  };
  let autoId = 0;

  function makeBuilder(table) {
    return {
      where: (q) => ({
        first: async () => {
          if (table === 'matches')              return state.matches[q.match_id] || null;
          if (table === 'offline_sync_requests') return state.offlineRequests[q.request_key] || null;
          if (table === 'offline_sync_results') return state.offlineResults[`${q.device_id}:${q.action_id}`] || null;
          if (table === 'roster_audit')         return state.rosterAudit[q.request_id] || null;
          return null;
        },
        count: function() {
          let cnt = 0;
          if (table === 'match_events') {
            cnt = Object.values(state.matchEvents).filter(e => e.match_id === q.match_id).length;
          }
          if (table === 'roster_audit') {
            cnt = Object.values(state.rosterAudit).filter(e => e.player_id === q.player_id).length;
          }
          return { first: async () => ({ cnt }) };
        },
        insert: async (row) => {
          if (table === 'offline_sync_requests') state.offlineRequests[row.request_key] = row;
          if (table === 'offline_sync_results')  state.offlineResults[`${row.device_id}:${row.action_id}`] = row;
          return { onConflict: () => ({ ignore: async () => {} }) };
        },
      }),
      insert: async (row) => {
        if (table === 'offline_sync_requests') state.offlineRequests[row.request_key] = row;
        if (table === 'offline_sync_results')  state.offlineResults[`${row.device_id}:${row.action_id}`] = row;
        return {
          onConflict: () => ({ ignore: async () => {} }),
        };
      },
    };
  }

  const dbFn = (table) => makeBuilder(table);
  dbFn.transaction = async (fn) => { await fn(dbFn); };
  dbFn.raw = async () => {};
  dbFn.__state = state;

  return dbFn;
});

// Mock eventsService
jest.mock('../src/services/eventsService', () => ({
  appendEvent: jest.fn(async (payload) => {
    // Simulate success
    return {
      _isReplay: false,
      data: {
        event_id: payload.event_id,
        match_id: payload.match_id,
        type: payload.type,
        sequence: 1,
        match_version: 1,
        signature: 'a'.repeat(64),
      },
    };
  }),
}));

// Mock rosterService
jest.mock('../src/services/rosterService', () => ({
  transfer: jest.fn(async (payload) => ({
    _isReplay: false,
    data: { request_id: payload.request_id, status: 'accepted' },
  })),
}));

// Mock HMAC
jest.mock('../src/config/env', () => ({
  PORT: 8080, NODE_ENV: 'test', DAY1_SALT: 'demo-salt',
  DATABASE_URL: '', REDIS_URL: '', JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '2h',
}));

const offlineSyncService = require('../src/services/offlineSyncService');
const eventsService     = require('../src/services/eventsService');
const rosterService     = require('../src/services/rosterService');
const db                 = require('../src/config/db');

beforeEach(() => {
  jest.clearAllMocks();
  const s = db.__state;
  for (const k of Object.keys(s.matches))          delete s.matches[k];
  for (const k of Object.keys(s.matchEvents))      delete s.matchEvents[k];
  for (const k of Object.keys(s.rosterAudit))      delete s.rosterAudit[k];
  for (const k of Object.keys(s.offlineRequests))  delete s.offlineRequests[k];
  for (const k of Object.keys(s.offlineResults))    delete s.offlineResults[k];
});

// Helper: create a match with some events
function seedMatch(matchId, eventCount = 3) {
  db.__state.matches[matchId] = { match_id: matchId, status: 'in_progress' };
  for (let i = 1; i <= eventCount; i++) {
    db.__state.matchEvents[`${matchId}-e${i}`] = { match_id: matchId, sequence: i };
  }
}

describe('Offline Sync', () => {

  test('score_event with matching base_version → applied, resolution null', async () => {
    seedMatch('m1', 3);
    const r = await offlineSyncService.sync({
      device_id: 'dev-1',
      actions: [{
        action_id: 'a1', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 3,
        payload: { event_id: 'evt-1', match_id: 'm1', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    });
    expect(r.results[0].status).toBe('applied');
    expect(r.results[0].resolution).toBeNull(); // Issue #3 fixed: actual null, not string 'null'
    expect(r.results[0].error_code).toBeNull();
    expect(r.results[0].signature).toMatch(/^[0-9a-f]{64}$/);
    expect(r.summary.applied).toBe(1);
  });

  test('score_event with stale base_version → applied, rebased_append', async () => {
    seedMatch('m2', 5);
    const r = await offlineSyncService.sync({
      device_id: 'dev-2',
      actions: [{
        action_id: 'a2', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 3, // stale — server has 5
        payload: { event_id: 'evt-2', match_id: 'm2', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    });
    expect(r.results[0].status).toBe('applied');
    expect(r.results[0].resolution).toBe('rebased_append');
  });

  test('score_event with base_version > current → rejected INVALID_BASE_VERSION', async () => {
    seedMatch('m3', 2);
    const r = await offlineSyncService.sync({
      device_id: 'dev-3',
      actions: [{
        action_id: 'a3', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 10, // way ahead of current (2)
        payload: { event_id: 'evt-3', match_id: 'm3', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    });
    expect(r.results[0].status).toBe('rejected');
    expect(r.results[0].resolution).toBe('server_wins');
    expect(r.results[0].error_code).toBe('INVALID_BASE_VERSION');
  });

  test('score_event on missing match → rejected MATCH_NOT_FOUND', async () => {
    const r = await offlineSyncService.sync({
      device_id: 'dev-4',
      actions: [{
        action_id: 'a4', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 0,
        payload: { event_id: 'evt-4', match_id: 'nope', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    });
    expect(r.results[0].status).toBe('rejected');
    expect(r.results[0].error_code).toBe('MATCH_NOT_FOUND');
  });

  test('duplicate action (already processed) → skipped_duplicate', async () => {
    seedMatch('m5', 3);
    // First call
    await offlineSyncService.sync({
      device_id: 'dev-5',
      actions: [{
        action_id: 'a5', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 3,
        payload: { event_id: 'evt-5', match_id: 'm5', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    });
    // Second call — same action
    const r = await offlineSyncService.sync({
      device_id: 'dev-5',
      actions: [{
        action_id: 'a5', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 3,
        payload: { event_id: 'evt-5', match_id: 'm5', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    });
    expect(r.results[0].status).toBe('duplicate');
    expect(r.results[0].resolution).toBe('skipped_duplicate');
  });

  test('roster_transfer with matching base_version → applied', async () => {
    // Seed some audit entries
    for (let i = 1; i <= 2; i++) {
      db.__state.rosterAudit[`tr-${i}`] = { player_id: 'p1', request_id: `tr-${i}`, id: i };
    }
    const r = await offlineSyncService.sync({
      device_id: 'dev-6',
      actions: [{
        action_id: 'a6', type: 'roster_transfer', queued_at: '2026-10-17T11:00:00Z',
        base_version: 2,
        payload: { request_id: 'tr-new', league_id: 'lg-1', player_id: 'p1', type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b', effective_date: '2026-09-15' },
      }],
    });
    expect(r.results[0].status).toBe('applied');
    expect(r.results[0].signature).toBeNull(); // roster transfers don't return signature
  });

  test('roster_transfer rejected by rules → rejected with rule error code', async () => {
    // Make rosterService.transfer throw
    const { AppError } = require('../src/utils/errors');
    rosterService.transfer.mockRejectedValueOnce(new AppError(409, 'SQUAD_FULL', 'Squad is full.', {}));

    db.__state.rosterAudit['existing'] = { player_id: 'p1', request_id: 'existing', id: 1 };

    const r = await offlineSyncService.sync({
      device_id: 'dev-7',
      actions: [{
        action_id: 'a7', type: 'roster_transfer', queued_at: '2026-10-17T11:00:00Z',
        base_version: 1,
        payload: { request_id: 'tr-fail', league_id: 'lg-1', player_id: 'p1', type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b', effective_date: '2026-09-15' },
      }],
    });
    expect(r.results[0].status).toBe('rejected');
    expect(r.results[0].resolution).toBe('server_wins');
    expect(r.results[0].error_code).toBe('SQUAD_FULL');
  });

  test('actions sorted by queued_at ascending', async () => {
    seedMatch('m10', 1);
    eventsService.appendEvent.mockResolvedValue({
      _isReplay: false,
      data: { match_version: 2, signature: 'b'.repeat(64) },
    });

    const r = await offlineSyncService.sync({
      device_id: 'dev-10',
      actions: [
        { action_id: 'late', type: 'score_event', queued_at: '2026-10-17T11:02:00Z', base_version: 1,
          payload: { event_id: 'evt-late', match_id: 'm10', type: 'score', payload: { team_id: 't1', event_type: 'goal' } } },
        { action_id: 'early', type: 'score_event', queued_at: '2026-10-17T11:00:00Z', base_version: 1,
          payload: { event_id: 'evt-early', match_id: 'm10', type: 'score', payload: { team_id: 't1', event_type: 'goal' } } },
      ],
    });
    // Results returned in request order, but processed_order reflects sorted order
    expect(r.results[0].action_id).toBe('late');
    expect(r.results[1].action_id).toBe('early');
    // early (11:00) should be processed first
    expect(r.results[1].processed_order).toBe(1);
    expect(r.results[0].processed_order).toBe(2);
  });

  test('full request idempotency — resend returns same results', async () => {
    seedMatch('m11', 2);
    const body = {
      device_id: 'dev-11',
      actions: [{
        action_id: 'a11', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 2,
        payload: { event_id: 'evt-11', match_id: 'm11', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    };
    const r1 = await offlineSyncService.sync(body);
    const r2 = await offlineSyncService.sync(body);
    expect(r1).toEqual(r2);
  });

  test('summary counts are correct', async () => {
    seedMatch('m12', 1);
    eventsService.appendEvent.mockResolvedValueOnce({
      _isReplay: false,
      data: { match_version: 2, signature: 'c'.repeat(64) },
    });
    // Make second action fail
    eventsService.appendEvent.mockRejectedValueOnce(
      new (require('../src/utils/errors').AppError)(409, 'MATCH_NOT_IN_PROGRESS', 'Not in progress', {})
    );

    const r = await offlineSyncService.sync({
      device_id: 'dev-12',
      actions: [
        { action_id: 'ok', type: 'score_event', queued_at: '2026-10-17T11:00:00Z', base_version: 1,
          payload: { event_id: 'evt-ok', match_id: 'm12', type: 'score', payload: { team_id: 't1', event_type: 'goal' } } },
        { action_id: 'fail', type: 'score_event', queued_at: '2026-10-17T11:01:00Z', base_version: 1,
          payload: { event_id: 'evt-fail', match_id: 'm12', type: 'score', payload: { team_id: 't1', event_type: 'goal' } } },
      ],
    });
    expect(r.summary.applied).toBe(1);
    expect(r.summary.rejected).toBe(1);
    expect(r.summary.duplicate).toBe(0);
  });

  test('always returns HTTP 200 format (no throw on action failure)', async () => {
    seedMatch('m13', 1);
    eventsService.appendEvent.mockRejectedValueOnce(
      new (require('../src/utils/errors').AppError)(409, 'ILLEGAL_TRANSITION', 'Bad state', {})
    );

    const r = await offlineSyncService.sync({
      device_id: 'dev-13',
      actions: [{
        action_id: 'a13', type: 'score_event', queued_at: '2026-10-17T11:00:00Z',
        base_version: 1,
        payload: { event_id: 'evt-13', match_id: 'm13', type: 'score', payload: { team_id: 't1', event_type: 'goal' } },
      }],
    });
    // Should not throw — returns result with rejected status
    expect(r).toBeDefined();
    expect(r.results[0].status).toBe('rejected');
    expect(r.results[0].error_code).toBe('ILLEGAL_TRANSITION');
  });
});
