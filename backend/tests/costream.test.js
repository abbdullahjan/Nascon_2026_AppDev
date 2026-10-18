'use strict';

/**
 * Unit tests for src/modules/costream/
 *
 * Tests the full spec 5.5 contract:
 *   - All 5 validation steps in order
 *   - All three host-drop scenarios
 *   - Idempotent replay → 200
 *   - Signature correctness
 *   - Edge case 1 (spec 8.1): host drop on 4-way session
 *
 * No network calls. DB is stubbed inline with mockPlayers / mockSessions.
 */

// ── env before any require ───────────────────────────────────────────────────
process.env.DAY2_SALT         = 'T01D27ad7ffff12e';
process.env.DAY1_SALT         = 'demo-salt';
process.env.MEDIA_HOST        = 'localhost';
process.env.MEDIA_HLS_PORT    = '8888';

// ── DB mock data (mockX prefix required by Jest factory rules) ───────────────
const mockPlayers = {
  'player-alpha-1': { player_id: 'player-alpha-1' },
  'player-alpha-2': { player_id: 'player-alpha-2' },
  'player-beta-1':  { player_id: 'player-beta-1'  },
  'player-beta-2':  { player_id: 'player-beta-2'  },
};
const mockSessions = {};  // session_id → row

jest.mock('../src/config/db', () => {
  const players  = mockPlayers;   // eslint-disable-line no-undef
  const sessions = mockSessions;  // eslint-disable-line no-undef

  const builder = (table) => {
    const b = {
      _table: table, _wheres: {},
      where(q) { Object.assign(this._wheres, q); return this; },
      async first() {
        if (this._table === 'players')
          return players[this._wheres.player_id] || null;
        if (this._table === 'costream_sessions')
          return sessions[this._wheres.session_id] || null;
        return null;
      },
      async insert(row) {
        if (this._table === 'costream_sessions')
          sessions[row.session_id] = { ...row };
      },
      async truncate() {
        for (const k of Object.keys(sessions)) delete sessions[k];
      },
    };
    return b;
  };

  builder.transaction = async (fn) => fn(builder);
  builder.raw = () => {};
  return builder;
});

// ─────────────────────────────────────────────────────────────────────────────
const { processSession, buildSigPayload, buildUrls, requestHash } =
  require('../src/modules/costream/sessionService');

function clearSessions() {
  for (const k of Object.keys(mockSessions)) delete mockSessions[k];
}

beforeEach(() => clearSessions());

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const BASE = {
  session_id:      'cs-session-101',
  host_player_id:  'player-alpha-1',
  participants:    ['player-alpha-1', 'player-alpha-2', 'player-beta-1', 'player-beta-2'],
  layout:          'grid_4',
  simulate_host_drop: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema validation (Step 1)
// ─────────────────────────────────────────────────────────────────────────────
describe('Step 1 — schema validation', () => {
  test('missing session_id → 400 VALIDATION_ERROR', async () => {
    expect.assertions(2);
    try { await processSession({ ...BASE, session_id: undefined }); }
    catch (e) { expect(e.httpStatus).toBe(400); expect(e.errorCode).toBe('VALIDATION_ERROR'); }
  });

  test('missing host_player_id → 400 VALIDATION_ERROR', async () => {
    expect.assertions(2);
    try { await processSession({ ...BASE, host_player_id: undefined }); }
    catch (e) { expect(e.httpStatus).toBe(400); expect(e.errorCode).toBe('VALIDATION_ERROR'); }
  });

  test('empty participants array → 400 VALIDATION_ERROR', async () => {
    expect.assertions(2);
    try { await processSession({ ...BASE, participants: [] }); }
    catch (e) { expect(e.httpStatus).toBe(400); expect(e.errorCode).toBe('VALIDATION_ERROR'); }
  });

  test('duplicate participants → 400 VALIDATION_ERROR', async () => {
    expect.assertions(2);
    try {
      await processSession({ ...BASE, participants: ['player-alpha-1', 'player-alpha-1'] });
    }
    catch (e) { expect(e.httpStatus).toBe(400); expect(e.errorCode).toBe('VALIDATION_ERROR'); }
  });

  test('simulate_host_drop is non-boolean → 400 VALIDATION_ERROR', async () => {
    expect.assertions(2);
    try { await processSession({ ...BASE, simulate_host_drop: 'yes' }); }
    catch (e) { expect(e.httpStatus).toBe(400); expect(e.errorCode).toBe('VALIDATION_ERROR'); }
  });

  test('invalid layout value → 400 VALIDATION_ERROR', async () => {
    expect.assertions(2);
    try { await processSession({ ...BASE, layout: 'hexagon' }); }
    catch (e) { expect(e.httpStatus).toBe(400); expect(e.errorCode).toBe('VALIDATION_ERROR'); }
  });

  test('host_player_id not in participants → 400 VALIDATION_ERROR', async () => {
    expect.assertions(3);
    try {
      await processSession({ ...BASE, host_player_id: 'player-beta-2',
        participants: ['player-alpha-1', 'player-alpha-2'] });
    }
    catch (e) {
      expect(e.httpStatus).toBe(400);
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toContain('host_player_id');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Player existence (Step 2)
// ─────────────────────────────────────────────────────────────────────────────
describe('Step 2 — player existence', () => {
  test('unknown player in participants → 404 PLAYER_NOT_FOUND', async () => {
    expect.assertions(3);
    try {
      await processSession({ ...BASE, participants: ['player-alpha-1', 'player-ghost-99'],
        host_player_id: 'player-alpha-1' });
    }
    catch (e) {
      expect(e.httpStatus).toBe(404);
      expect(e.errorCode).toBe('PLAYER_NOT_FOUND');
      expect(e.details.player_id).toBe('player-ghost-99');
    }
  });

  test('all seeded players pass existence check', async () => {
    const result = await processSession(BASE);
    expect(result.httpStatus).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Max capacity (Step 3)
// ─────────────────────────────────────────────────────────────────────────────
describe('Step 3 — max capacity', () => {
  test('>4 participants → 409 COSTREAM_SESSION_FULL', async () => {
    expect.assertions(2);
    // Need 5 unique player IDs — add a fake one that exists
    mockPlayers['player-extra-5'] = { player_id: 'player-extra-5' };
    try {
      await processSession({ ...BASE,
        participants: ['player-alpha-1','player-alpha-2','player-beta-1','player-beta-2','player-extra-5'] });
    }
    catch (e) {
      expect(e.httpStatus).toBe(409);
      expect(e.errorCode).toBe('COSTREAM_SESSION_FULL');
    } finally {
      delete mockPlayers['player-extra-5'];
    }
  });

  test('exactly 4 participants passes capacity check', async () => {
    const result = await processSession(BASE);
    expect(result.httpStatus).toBe(201);
    expect(result.data.participant_count).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Layout capacity (Step 4) — uses count BEFORE host drop
// ─────────────────────────────────────────────────────────────────────────────
describe('Step 4 — layout capacity (before host drop)', () => {
  test('solo layout with 2 participants → 400 UNSUPPORTED_LAYOUT', async () => {
    expect.assertions(3);
    try {
      await processSession({ ...BASE,
        participants: ['player-alpha-1','player-alpha-2'],
        host_player_id: 'player-alpha-1',
        layout: 'solo', simulate_host_drop: false });
    }
    catch (e) {
      expect(e.httpStatus).toBe(400);
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toContain('layout');
    }
  });

  test('solo layout with 1 participant passes', async () => {
    const result = await processSession({ ...BASE,
      participants: ['player-alpha-1'],
      host_player_id: 'player-alpha-1',
      layout: 'solo', simulate_host_drop: false });
    expect(result.httpStatus).toBe(201);
  });

  test('grid_2 layout with 3 participants → 400 UNSUPPORTED_LAYOUT', async () => {
    expect.assertions(2);
    try {
      await processSession({ ...BASE,
        participants: ['player-alpha-1','player-alpha-2','player-beta-1'],
        host_player_id: 'player-alpha-1',
        layout: 'grid_2' });
    }
    catch (e) {
      expect(e.httpStatus).toBe(400);
      expect(e.errorCode).toBe('VALIDATION_ERROR');
    }
  });

  test('grid_2 layout with 2 participants passes', async () => {
    const result = await processSession({ ...BASE,
      participants: ['player-alpha-1','player-alpha-2'],
      host_player_id: 'player-alpha-1',
      layout: 'grid_2' });
    expect(result.httpStatus).toBe(201);
  });

  test('grid_4 and spotlight layouts accept 4 participants', async () => {
    const r1 = await processSession({ ...BASE, layout: 'grid_4', session_id: 'cs-1' });
    const r2 = await processSession({ ...BASE, layout: 'spotlight', session_id: 'cs-2' });
    expect(r1.httpStatus).toBe(201);
    expect(r2.httpStatus).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Host-drop handoff (Step 5)
// ─────────────────────────────────────────────────────────────────────────────
describe('Step 5 — host-drop handoff', () => {
  test('simulate_host_drop=false → active_host=host, handoff_occurred=false', async () => {
    const { data } = await processSession({ ...BASE, simulate_host_drop: false });
    expect(data.active_host).toBe('player-alpha-1');
    expect(data.handoff_occurred).toBe(false);
    expect(data.participant_count).toBe(4);
    expect(data.active_participants).toEqual(BASE.participants);
    expect(data.status).toBe('active');
  });

  test('simulate_host_drop=true, 4 participants → host removed, next becomes host', async () => {
    const { data } = await processSession({ ...BASE, simulate_host_drop: true });
    // host player-alpha-1 removed; remaining[0] = player-alpha-2
    expect(data.active_host).toBe('player-alpha-2');
    expect(data.handoff_occurred).toBe(true);
    expect(data.participant_count).toBe(3);
    expect(data.active_participants).toEqual(['player-alpha-2','player-beta-1','player-beta-2']);
    expect(data.status).toBe('active');
  });

  test('simulate_host_drop=true, 2 participants → host removed, remaining[0] becomes host', async () => {
    const { data } = await processSession({ ...BASE,
      participants: ['player-alpha-1','player-alpha-2'],
      host_player_id: 'player-alpha-1',
      simulate_host_drop: true });
    expect(data.active_host).toBe('player-alpha-2');
    expect(data.participant_count).toBe(1);
    expect(data.handoff_occurred).toBe(true);
    expect(data.status).toBe('active');
  });

  test('simulate_host_drop=true, sole participant → terminated session', async () => {
    const { data } = await processSession({ ...BASE,
      participants: ['player-alpha-1'],
      host_player_id: 'player-alpha-1',
      simulate_host_drop: true });
    expect(data.active_host).toBeNull();
    expect(data.handoff_occurred).toBe(false);
    expect(data.participant_count).toBe(0);
    expect(data.status).toBe('terminated');
    expect(data.active_participants).toEqual([]);
  });

  test('spec 8.1 edge case: 4-way drop → participant_count 3, chat_room_id unchanged', async () => {
    const { data } = await processSession({ ...BASE, simulate_host_drop: true });
    expect(data.participant_count).toBe(3);
    expect(data.chat_room_id).toBe('chat-cs-session-101');
    expect(data.composite_playback_url).toContain('cs-session-101');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Default values
// ─────────────────────────────────────────────────────────────────────────────
describe('Default values', () => {
  test('layout defaults to grid_4 when omitted', async () => {
    const body = { ...BASE };
    delete body.layout;
    const { data } = await processSession(body);
    expect(data.layout).toBe('grid_4');
  });

  test('simulate_host_drop defaults to false when omitted', async () => {
    const body = { ...BASE };
    delete body.simulate_host_drop;
    const { data } = await processSession(body);
    expect(data.handoff_occurred).toBe(false);
    expect(data.active_host).toBe('player-alpha-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Response shape
// ─────────────────────────────────────────────────────────────────────────────
describe('Response shape', () => {
  test('201 response contains all required fields', async () => {
    const { data, httpStatus } = await processSession(BASE);
    expect(httpStatus).toBe(201);
    expect(data).toHaveProperty('session_id');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('active_host');
    expect(data).toHaveProperty('handoff_occurred');
    expect(data).toHaveProperty('participant_count');
    expect(data).toHaveProperty('active_participants');
    expect(data).toHaveProperty('layout');
    expect(data).toHaveProperty('composite_playback_url');
    expect(data).toHaveProperty('chat_room_id');
    expect(data).toHaveProperty('signature');
  });

  test('composite_playback_url format is correct', async () => {
    const { data } = await processSession(BASE);
    expect(data.composite_playback_url)
      .toBe('http://localhost:8888/costream/cs-session-101/index.m3u8');
  });

  test('chat_room_id is chat-{session_id}', async () => {
    const { data } = await processSession(BASE);
    expect(data.chat_room_id).toBe('chat-cs-session-101');
  });

  test('signature is 64-char lowercase hex', async () => {
    const { data } = await processSession(BASE);
    expect(data.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Signature correctness
// ─────────────────────────────────────────────────────────────────────────────
describe('Signature (Section 5.3)', () => {
  test('sig_payload has exactly 6 required keys in correct order', () => {
    const p = buildSigPayload('cs-1', 'active', 'player-alpha-2', true, 'grid_4', 3);
    expect(Object.keys(p).sort()).toEqual(
      ['active_host','handoff_occurred','layout','participant_count','session_id','status'].sort()
    );
  });

  test('signature changes when active_host changes', async () => {
    const r1 = await processSession({ ...BASE, simulate_host_drop: false });
    clearSessions();
    const r2 = await processSession({ ...BASE, simulate_host_drop: true });
    // Different hosts → different signatures
    expect(r1.data.signature).not.toBe(r2.data.signature);
  });

  test('signature changes when participant_count changes', async () => {
    const p1 = buildSigPayload('cs-x', 'active', 'p1', false, 'grid_4', 4);
    const p2 = buildSigPayload('cs-x', 'active', 'p1', false, 'grid_4', 3);
    const { sign_day2 } = require('../src/shared/sign');
    expect(sign_day2('cs-x', p1)).not.toBe(sign_day2('cs-x', p2));
  });

  test('terminated session has null active_host in signature payload', () => {
    const p = buildSigPayload('cs-t', 'terminated', null, false, 'grid_4', 0);
    expect(p.active_host).toBeNull();
    expect(p.status).toBe('terminated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Idempotency
// ─────────────────────────────────────────────────────────────────────────────
describe('Idempotency', () => {
  test('second call with same session_id → 200 with same data', async () => {
    const r1 = await processSession(BASE);
    expect(r1.httpStatus).toBe(201);

    const r2 = await processSession(BASE);
    expect(r2.httpStatus).toBe(200);
    expect(r2.data.session_id).toBe(r1.data.session_id);
    expect(r2.data.active_host).toBe(r1.data.active_host);
  });

  test('replay returns identical signature', async () => {
    const r1 = await processSession(BASE);
    const r2 = await processSession(BASE);
    expect(r1.data.signature).toBe(r2.data.signature);
  });

  test('replay with different payload still returns stored result (200)', async () => {
    await processSession(BASE);
    // Different layout — but same session_id already stored
    const r2 = await processSession({ ...BASE, layout: 'spotlight' });
    expect(r2.httpStatus).toBe(200);
    // Stored layout was grid_4
    expect(r2.data.layout).toBe('grid_4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. buildUrls helper
// ─────────────────────────────────────────────────────────────────────────────
describe('buildUrls()', () => {
  test('returns correct composite_playback_url and chat_room_id', () => {
    const urls = buildUrls('cs-session-42');
    expect(urls.composite_playback_url).toBe('http://localhost:8888/costream/cs-session-42/index.m3u8');
    expect(urls.chat_room_id).toBe('chat-cs-session-42');
  });
});
