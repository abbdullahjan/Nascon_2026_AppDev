'use strict';

// ── Mock DB (state inside factory) ──────────────────────────────────────────
jest.mock('../src/config/db', () => {
  const state = {
    rosterLeagues: {}, squads: {}, players: {}, registrations: {},
    audit: {}, liveMatches: {},
  };
  let regAutoId = 0, auditAutoId = 0;

  function makeBuilder(table) {
    return {
      where(q) {
        return {
          first: async () => {
            if (table === 'roster_leagues') return state.rosterLeagues[q.league_id] || null;
            if (table === 'players')        return state.players[q.player_id] || null;
            if (table === 'squads')         return state.squads[q.squad_id] || null;
            if (table === 'roster_audit')   return state.audit[q.request_id] || null;
            if (table === 'player_registrations') {
              return Object.values(state.registrations).find(r =>
                r.player_id === q.player_id && r.league_id === q.league_id && r.squad_id === q.squad_id
              ) || (q.player_id ? Object.values(state.registrations).find(r => r.player_id === q.player_id) : null) || null;
            }
            return null;
          },
          count: function() {
            const all = Object.values(state.registrations).filter(r => {
              if (q.league_id && r.league_id !== q.league_id) return false;
              if (q.squad_id && r.squad_id !== q.squad_id) return false;
              if (q.position && r.position !== q.position) return false;
              return true;
            });
            return { first: async () => ({ cnt: all.length }) };
          },
          update: async (patch) => {
            if (table === 'player_registrations') {
              for (const r of Object.values(state.registrations)) {
                if (q.player_id && r.player_id === q.player_id) Object.assign(r, patch);
              }
            }
          },
          delete: async () => {
            if (table === 'player_registrations') {
              for (const k of Object.keys(state.registrations)) {
                if (state.registrations[k].player_id === q.player_id &&
                    (!q.league_id || state.registrations[k].league_id === q.league_id)) {
                  delete state.registrations[k];
                }
              }
            }
          },
          orderBy: async () => {
            if (table === 'roster_audit') {
              return Object.values(state.audit)
                .filter(e => e.player_id === q.player_id)
                .sort((a, b) => a.id - b.id);
            }
            return [];
          },
          // Allow where without .first() — return array
          then: (resolve) => resolve(
            table === 'roster_live_matches'
              ? Object.values(state.liveMatches).filter(m => !q.league_id || m.league_id === q.league_id)
              : []
          ),
        };
      },
      insert: async (row) => {
        if (table === 'roster_leagues')      state.rosterLeagues[row.league_id] = row;
        if (table === 'squads')              state.squads[row.squad_id] = row;
        if (table === 'players')             state.players[row.player_id] = row;
        if (table === 'player_registrations') { regAutoId++; state.registrations[regAutoId] = { ...row, id: regAutoId }; }
        if (table === 'roster_audit')        { auditAutoId++; state.audit[row.request_id] = { ...row, id: auditAutoId }; }
        if (table === 'roster_live_matches')  state.liveMatches[row.match_id] = row;
      },
    };
  }

  const dbFn = (table) => makeBuilder(table);
  dbFn.transaction = async (fn) => {
    const trx = dbFn;
    trx.raw = async () => {};
    await fn(trx);
  };
  dbFn.raw = async () => {};
  dbFn.__state = state;

  return dbFn;
});

// Mock sportsService.getSport
jest.mock('../src/services/sportsService', () => ({
  getSport: async (id) => ({
    sport_id: id, scoring_model: 'event',
    roster: { min_squad_size: 5, max_squad_size: 25, required_positions: { gk: 1 } },
  }),
}));

const rosterService = require('../src/services/rosterService');
const db = require('../src/config/db');

beforeEach(() => {
  const s = db.__state;
  for (const k of Object.keys(s.rosterLeagues))  delete s.rosterLeagues[k];
  for (const k of Object.keys(s.squads))          delete s.squads[k];
  for (const k of Object.keys(s.players))        delete s.players[k];
  for (const k of Object.keys(s.registrations))  delete s.registrations[k];
  for (const k of Object.keys(s.audit))          delete s.audit[k];
  for (const k of Object.keys(s.liveMatches))    delete s.liveMatches[k];
});

async function basicSetup() {
  return rosterService.setup({
    league: {
      league_id: 'lg-r1', tenant_id: 'tenant-alpha', sport_id: 'football',
      transfer_window: { open: '2026-09-01', close: '2026-09-30' },
      max_squad_size: 3, required_positions: { gk: 1 },
    },
    squads: [
      { squad_id: 'sq-a', club_id: 'club-a', tenant_id: 'tenant-alpha', name: 'A' },
      { squad_id: 'sq-b', club_id: 'club-b', tenant_id: 'tenant-alpha', name: 'B' },
    ],
    players: [
      { player_id: 'p1', name: 'Ali',   position: 'gk', squad_id: 'sq-a', role: 'captain' },
      { player_id: 'p2', name: 'Bilal', position: 'df', squad_id: 'sq-a', role: 'starter' },
      { player_id: 'p3', name: 'Caleb', position: 'fw', squad_id: 'sq-b', role: 'starter' },
    ],
    matches_in_progress: [],
  });
}

describe('Roster Setup', () => {
  test('setup creates squads and player registrations', async () => {
    const r = await basicSetup();
    expect(r.status).toBe('configured');
    expect(r.squad_counts['sq-a']).toBe(2);
    expect(r.squad_counts['sq-b']).toBe(1);
  });

  test('re-sending same league_id replaces state', async () => {
    await basicSetup();
    const r = await rosterService.setup({
      league: { league_id: 'lg-r1', tenant_id: 'tenant-alpha', sport_id: 'football',
        transfer_window: { open: '2026-09-01', close: '2026-09-30' },
        max_squad_size: 3, required_positions: {} },
      squads: [{ squad_id: 'sq-c', club_id: 'club-c', tenant_id: 'tenant-alpha', name: 'C' }],
      players: [{ player_id: 'p4', name: 'Dan', position: 'mf', squad_id: 'sq-c', role: 'starter' }],
      matches_in_progress: [],
    });
    expect(r.squad_counts['sq-c']).toBe(1);
    expect(r.squad_counts['sq-a']).toBeUndefined();
  });

  test('missing league_id → 400', async () => {
    await expect(
      rosterService.setup({ squads: [], players: [] })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });
});

describe('Transfer Rules (8-rule validation)', () => {
  beforeEach(basicSetup);

  test('valid transfer → accepted, active', async () => {
    const r = await rosterService.transfer({
      request_id: 'tr-001', league_id: 'lg-r1', player_id: 'p2',
      type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
      effective_date: '2026-09-15', loan_end_date: null,
      reason: 'Tactical move', requested_by: 'user-77',
    });
    expect(r.data.status).toBe('accepted');
    expect(r.data.state).toBe('active');
    expect(r.data.registration.squad_id).toBe('sq-b');
    expect(r.data.registration.role).toBe('substitute');
  });

  test('missing required fields → 400', async () => {
    await expect(
      rosterService.transfer({ request_id: 'tr-x', league_id: 'lg-r1' })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('loan without loan_end_date → 400', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-l1', league_id: 'lg-r1', player_id: 'p2',
        type: 'loan', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('loan_end_date <= effective_date → 400', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-l2', league_id: 'lg-r1', player_id: 'p2',
        type: 'loan', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
        effective_date: '2026-09-15', loan_end_date: '2026-09-10',
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
  });

  test('unknown league → 404 LEAGUE_NOT_FOUND', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-404', league_id: 'nope', player_id: 'p2',
        type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'LEAGUE_NOT_FOUND' });
  });

  test('unknown player → 404 PLAYER_NOT_FOUND', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-404p', league_id: 'lg-r1', player_id: 'nope',
        type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'PLAYER_NOT_FOUND' });
  });

  test('unknown squad → 404 SQUAD_NOT_FOUND', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-404s', league_id: 'lg-r1', player_id: 'p2',
        type: 'transfer', from_squad_id: 'nope', to_squad_id: 'sq-b',
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'SQUAD_NOT_FOUND' });
  });

  test('player not in from_squad → 409 NOT_IN_SQUAD', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-ni', league_id: 'lg-r1', player_id: 'p3',
        type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'NOT_IN_SQUAD' });
  });

  test('transfer outside window → 409 TRANSFER_WINDOW_CLOSED', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-tw', league_id: 'lg-r1', player_id: 'p2',
        type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
        effective_date: '2026-10-15',
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'TRANSFER_WINDOW_CLOSED' });
  });

  test('release allowed on any date (no window check)', async () => {
    const r = await rosterService.transfer({
      request_id: 'tr-rel', league_id: 'lg-r1', player_id: 'p2',
      type: 'release', from_squad_id: 'sq-a', to_squad_id: null,
      effective_date: '2026-12-15',
    });
    expect(r.data.status).toBe('accepted');
    expect(r.data.registration).toBeNull();
  });

  test('destination squad full → 409 SQUAD_FULL', async () => {
    await rosterService.setup({
      league: {
        league_id: 'lg-r2', tenant_id: 'tenant-alpha', sport_id: 'football',
        transfer_window: { open: '2026-09-01', close: '2026-09-30' },
        max_squad_size: 1, required_positions: {},
      },
      squads: [
        { squad_id: 'sq-a2', tenant_id: 'tenant-alpha', name: 'A' },
        { squad_id: 'sq-b2', tenant_id: 'tenant-alpha', name: 'B' },
      ],
      players: [
        { player_id: 'p5', name: 'Eve', position: 'mf', squad_id: 'sq-a2', role: 'starter' },
        { player_id: 'p6', name: 'Fay', position: 'mf', squad_id: 'sq-b2', role: 'starter' },
      ],
      matches_in_progress: [],
    });
    await expect(
      rosterService.transfer({
        request_id: 'tr-full', league_id: 'lg-r2', player_id: 'p5',
        type: 'transfer', from_squad_id: 'sq-a2', to_squad_id: 'sq-b2',
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'SQUAD_FULL' });
  });

  test('min position violation → 409', async () => {
    await expect(
      rosterService.transfer({
        request_id: 'tr-min', league_id: 'lg-r1', player_id: 'p1',
        type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'MIN_POSITION_VIOLATION' });
  });

  test('same request_id + same body → 200 replay', async () => {
    const body = {
      request_id: 'tr-idem', league_id: 'lg-r1', player_id: 'p2',
      type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
      effective_date: '2026-09-15',
    };
    const r1 = await rosterService.transfer(body);
    expect(r1._isReplay).toBe(false);
    const r2 = await rosterService.transfer(body);
    expect(r2._isReplay).toBe(true);
  });

  test('same request_id + different body → 409', async () => {
    await rosterService.transfer({
      request_id: 'tr-dup', league_id: 'lg-r1', player_id: 'p2',
      type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
      effective_date: '2026-09-15',
    });
    await expect(
      rosterService.transfer({
        request_id: 'tr-dup', league_id: 'lg-r1', player_id: 'p2',
        type: 'release', from_squad_id: 'sq-a', to_squad_id: null,
        effective_date: '2026-09-15',
      })
    ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'DUPLICATE_EVENT_ID' });
  });

  test('loan sets parent_squad_id = lender', async () => {
    const r = await rosterService.transfer({
      request_id: 'tr-loan', league_id: 'lg-r1', player_id: 'p2',
      type: 'loan', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
      effective_date: '2026-09-15', loan_end_date: '2026-09-25',
    });
    expect(r.data.registration.parent_squad_id).toBe('sq-a');
    expect(r.data.registration.registration_type).toBe('loan');
    expect(r.data.registration.loan_end_date).toBe('2026-09-25');
  });

  test('deferred state when player in live match', async () => {
    await rosterService.setup({
      league: {
        league_id: 'lg-r3', tenant_id: 'tenant-alpha', sport_id: 'football',
        transfer_window: { open: '2026-09-01', close: '2026-09-30' },
        max_squad_size: 5, required_positions: {},
      },
      squads: [
        { squad_id: 'sq-a3', tenant_id: 'tenant-alpha', name: 'A' },
        { squad_id: 'sq-b3', tenant_id: 'tenant-alpha', name: 'B' },
      ],
      players: [
        { player_id: 'p7', name: 'Greg', position: 'mf', squad_id: 'sq-a3', role: 'starter' },
      ],
      matches_in_progress: [{ match_id: 'm-live', home_squad_id: 'sq-a3', away_squad_id: 'sq-b3' }],
    });
    const r = await rosterService.transfer({
      request_id: 'tr-def', league_id: 'lg-r3', player_id: 'p7',
      type: 'transfer', from_squad_id: 'sq-a3', to_squad_id: 'sq-b3',
      effective_date: '2026-09-30',
    });
    expect(r.data.state).toBe('deferred_until_match_end');
    expect(r.data.blocking_match_id).toBe('m-live');
  });
});

describe('Player History', () => {
  beforeEach(basicSetup);

  test('returns audit entries oldest-first', async () => {
    await rosterService.transfer({
      request_id: 'tr-h1', league_id: 'lg-r1', player_id: 'p2',
      type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
      effective_date: '2026-09-15',
    });
    const h = await rosterService.getHistory('p2');
    expect(h.player_id).toBe('p2');
    expect(h.history.length).toBe(1);
    expect(h.history[0].action).toBe('transfer');
  });

  test('unknown player → 404', async () => {
    await expect(rosterService.getHistory('nope')).rejects.toMatchObject({ httpStatus: 404, errorCode: 'PLAYER_NOT_FOUND' });
  });

  test('current_squad_id reflects latest transfer', async () => {
    await rosterService.transfer({
      request_id: 'tr-h2', league_id: 'lg-r1', player_id: 'p2',
      type: 'transfer', from_squad_id: 'sq-a', to_squad_id: 'sq-b',
      effective_date: '2026-09-15',
    });
    const h = await rosterService.getHistory('p2');
    expect(h.current_squad_id).toBe('sq-b');
  });

  test('release sets current_squad_id to null', async () => {
    await rosterService.transfer({
      request_id: 'tr-h3', league_id: 'lg-r1', player_id: 'p2',
      type: 'release', from_squad_id: 'sq-a', to_squad_id: null,
      effective_date: '2026-09-15',
    });
    const h = await rosterService.getHistory('p2');
    expect(h.current_squad_id).toBeNull();
  });
});
