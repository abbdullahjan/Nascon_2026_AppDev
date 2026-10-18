'use strict';

/**
 * Unit tests for src/modules/streaming/
 *
 * Covered without DB or network:
 *   1. keyService helpers — generateKey format, buildUrls, buildSigPayload, signKey
 *   2. Full generate/rotate/revoke flow via mocked DB
 *   3. Signature correctness using DAY2_SALT reference vector
 *   4. mediamtx.js kickPublisher — resilient to fetch failure
 *   5. mediamtx.js auth handler — allow/deny logic
 *
 * DB is stubbed inline. fetch is stubbed globally.
 * All expect.assertions(n) guards are in place for catch-block tests.
 */

// ── env before any require ───────────────────────────────────────────────────
process.env.DAY2_SALT  = 'T01D27ad7ffff12e';
process.env.DAY1_SALT  = 'demo-salt';
process.env.MEDIA_HOST        = 'localhost';
process.env.MEDIA_RTMP_PORT   = '1935';
process.env.MEDIA_HLS_PORT    = '8888';
process.env.MEDIA_WEBRTC_PORT = '8889';
process.env.MEDIAMTX_API_URL  = 'http://mediamtx:9997';

// ── stub realtime/store (Prometheus metric updates) ─────────────────────────
jest.mock('../src/modules/realtime/store', () => ({
  setMetric: jest.fn(),
  incMetric:  jest.fn(),
  getMetrics: jest.fn(() => ({})),
  resetStore: jest.fn(),
}));

// ── DB mock (self-contained factory — no out-of-scope vars) ──────────────────
// Jest requires mock factories to be self-contained. We use the `mock` prefix
// on module-level vars so Jest's babel transform allows them in the factory.
const mockPlayers = {
  'player-alpha-1': { player_id: 'player-alpha-1', name: 'Player Alpha 1' },
  'player-alpha-2': { player_id: 'player-alpha-2', name: 'Player Alpha 2' },
};
const mockStreamKeys = {};  // stream_key → row

jest.mock('../src/config/db', () => {
  // We need access to the module-level mockStreamKeys / mockPlayers.
  // Jest hoists jest.mock() to the top, but variables prefixed with "mock"
  // are allowed to be referenced from the factory per Jest's rules.
  const players    = mockPlayers;     // eslint-disable-line no-undef
  const streamKeys = mockStreamKeys;  // eslint-disable-line no-undef

  const builder = (table) => {
    const b = {
      _table: table, _wheres: {},
      where(q) { Object.assign(this._wheres, q); return this; },
      async first() {
        if (this._table === 'players') return players[this._wheres.player_id] || null;
        if (this._table === 'stream_keys') {
          return Object.values(streamKeys).find(r =>
            Object.entries(this._wheres).every(([k, v]) => r[k] === v)
          ) || null;
        }
        return null;
      },
      async update(patch) {
        if (this._table === 'stream_keys') {
          for (const row of Object.values(streamKeys)) {
            if (Object.entries(this._wheres).every(([k, v]) => row[k] === v))
              Object.assign(row, patch);
          }
        }
      },
      async insert(row) {
        if (this._table === 'stream_keys') streamKeys[row.stream_key] = { ...row };
      },
      async truncate() {
        for (const k of Object.keys(streamKeys)) delete streamKeys[k];
      },
      count() {
        const wheres = this._wheres;
        return {
          first: async () => ({
            cnt: String(Object.values(streamKeys).filter(r =>
              Object.entries(wheres).every(([k, v]) => r[k] === v)
            ).length),
          }),
        };
      },
    };
    return b;
  };

  builder.transaction = async (fn) => { await fn(builder); };
  builder.raw = () => {};
  return builder;
});

// ── stub fetch for kickPublisher ─────────────────────────────────────────────
global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// ─────────────────────────────────────────────────────────────────────────────
const {
  generateKey, buildUrls, buildSigPayload, signKey,
  generate, rotate, revoke, findActiveKey,
} = require('../src/modules/streaming/keyService');

const { kickPublisher, makeAuthHandler } = require('../src/modules/streaming/mediamtx');

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────
function clearKeys() {
  for (const k of Object.keys(mockStreamKeys)) delete mockStreamKeys[k];
}

beforeEach(() => {
  clearKeys();
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
describe('generateKey()', () => {
  test('matches ^sk_live_[a-f0-9]{16}$', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateKey()).toMatch(/^sk_live_[a-f0-9]{16}$/);
    }
  });

  test('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 50 }, generateKey));
    expect(keys.size).toBe(50);
  });
});

describe('buildUrls()', () => {
  test('returns correct RTMP, WebRTC, HLS URLs from env', () => {
    const urls = buildUrls('sk_live_aabbccdd11223344');
    expect(urls.ingest_endpoints.rtmp).toBe('rtmp://localhost:1935/live/sk_live_aabbccdd11223344');
    expect(urls.ingest_endpoints.webrtc).toBe('http://localhost:8889/live/sk_live_aabbccdd11223344/whip');
    expect(urls.playback_url).toBe('http://localhost:8888/live/sk_live_aabbccdd11223344/index.m3u8');
  });

  test('returns object with ingest_endpoints and playback_url keys', () => {
    const urls = buildUrls('sk_live_0000000000000000');
    expect(urls).toHaveProperty('ingest_endpoints');
    expect(urls).toHaveProperty('playback_url');
    expect(urls.ingest_endpoints).toHaveProperty('rtmp');
    expect(urls.ingest_endpoints).toHaveProperty('webrtc');
  });
});

describe('buildSigPayload()', () => {
  test('returns exact 4-key object in spec order', () => {
    const p = buildSigPayload('rotate', 'player-alpha-1', 'active', 'sk_live_9f83a1b2c3d4e5f6');
    expect(Object.keys(p)).toEqual(['action', 'player_id', 'status', 'stream_key']);
    expect(p.action).toBe('rotate');
    expect(p.player_id).toBe('player-alpha-1');
    expect(p.status).toBe('active');
    expect(p.stream_key).toBe('sk_live_9f83a1b2c3d4e5f6');
  });
});

describe('signKey() — Appendix A test vectors', () => {
  test('Vector 1: rotate with 4-key payload matches spec hash', () => {
    const payload = buildSigPayload('rotate', 'player-alpha-1', 'active', 'sk_live_9f83a1b2c3d4e5f6');
    expect(signKey('sk_live_9f83a1b2c3d4e5f6', payload))
      .toBe('9bd054eb746844b4701c6f158209c315ef2b16f392efd733bdf0715940610289');
  });

  test('output is 64 lowercase hex chars', () => {
    const payload = buildSigPayload('generate', 'player-alpha-1', 'active', 'sk_live_aabbccdd11223344');
    expect(signKey('sk_live_aabbccdd11223344', payload)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('different actions produce different signatures', () => {
    const p1 = buildSigPayload('generate', 'player-alpha-1', 'active', 'sk_live_0000000000000001');
    const p2 = buildSigPayload('revoke',   'player-alpha-1', 'revoked', 'sk_live_0000000000000001');
    expect(signKey('sk_live_0000000000000001', p1)).not.toBe(signKey('sk_live_0000000000000001', p2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. generate()
// ─────────────────────────────────────────────────────────────────────────────
describe('generate()', () => {
  test('returns 201 status, active key, ingest endpoints', async () => {
    const result = await generate({ playerId: 'player-alpha-1', label: 'OBS' });
    expect(result._httpStatus).toBe(201);
    expect(result.status).toBe('active');
    expect(result.stream_key).toMatch(/^sk_live_[a-f0-9]{16}$/);
    expect(result.ingest_endpoints.rtmp).toContain('rtmp://');
    expect(result.ingest_endpoints.webrtc).toContain('/whip');
    expect(result.playback_url).toContain('.m3u8');
  });

  test('uses stream_key_override exactly when provided', async () => {
    const result = await generate({
      playerId: 'player-alpha-1',
      streamKeyOverride: 'sk_live_9f83a1b2c3d4e5f6',
    });
    expect(result.stream_key).toBe('sk_live_9f83a1b2c3d4e5f6');
  });

  test('response contains 64-char hex signature', async () => {
    const result = await generate({ playerId: 'player-alpha-1' });
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  test('label defaults to "default" when omitted', async () => {
    const result = await generate({ playerId: 'player-alpha-1' });
    expect(result.label).toBe('default');
  });

  test('replaces previous active key for the same player', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_aaaaaaaaaaaaaaaa' });
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_bbbbbbbbbbbbbbbb' });

    // Old key must be revoked
    expect(mockStreamKeys['sk_live_aaaaaaaaaaaaaaaa'].status).toBe('revoked');
    // New key is active
    expect(mockStreamKeys['sk_live_bbbbbbbbbbbbbbbb'].status).toBe('active');
  });

  test('updates nascon_active_streams_total metric', async () => {
    const store = require('../src/modules/realtime/store');
    await generate({ playerId: 'player-alpha-1' });
    expect(store.setMetric).toHaveBeenCalledWith('nascon_active_streams_total', expect.any(Number));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. rotate()
// ─────────────────────────────────────────────────────────────────────────────
describe('rotate()', () => {
  test('returns 200 status with new active key', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_aaaaaaaaaaaaaaaa' });
    const result = await rotate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_cccccccccccccccc' });
    expect(result._httpStatus).toBe(200);
    expect(result.stream_key).toBe('sk_live_cccccccccccccccc');
    expect(result.status).toBe('active');
  });

  test('revokes the previous active key', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_aaaaaaaaaaaaaaaa' });
    await rotate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_dddddddddddddddd' });
    expect(mockStreamKeys['sk_live_aaaaaaaaaaaaaaaa'].status).toBe('revoked');
  });

  test('calls kickPublisher on the old key', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_aaaaaaaaaaaaaaaa' });
    await rotate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_eeeeeeeeeeeeeeee' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sk_live_aaaaaaaaaaaaaaaa'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('works even when no prior key exists (first-time rotate)', async () => {
    const result = await rotate({ playerId: 'player-alpha-2', streamKeyOverride: 'sk_live_ffffffffffffffff' });
    expect(result.status).toBe('active');
    expect(result._httpStatus).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. revoke()
// ─────────────────────────────────────────────────────────────────────────────
describe('revoke()', () => {
  test('returns 200 with status=revoked and null URLs', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_1111111111111111' });
    const result = await revoke({ playerId: 'player-alpha-1' });
    expect(result._httpStatus).toBe(200);
    expect(result.status).toBe('revoked');
    expect(result.ingest_endpoints).toBeNull();
    expect(result.playback_url).toBeNull();
  });

  test('marks the key as revoked in the DB', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_2222222222222222' });
    await revoke({ playerId: 'player-alpha-1' });
    expect(mockStreamKeys['sk_live_2222222222222222'].status).toBe('revoked');
  });

  test('calls kickPublisher on the revoked key', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_3333333333333333' });
    await revoke({ playerId: 'player-alpha-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sk_live_3333333333333333'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('throws 404 STREAM_NOT_FOUND when no active key exists', async () => {
    expect.assertions(3);
    try {
      await revoke({ playerId: 'player-alpha-1' });
    } catch (e) {
      expect(e.httpStatus).toBe(404);
      expect(e.errorCode).toBe('STREAM_NOT_FOUND');
      expect(e.details.player_id).toBe('player-alpha-1');
    }
  });

  test('response contains 64-char hex signature', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_4444444444444444' });
    const result = await revoke({ playerId: 'player-alpha-1' });
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. kickPublisher()
// ─────────────────────────────────────────────────────────────────────────────
describe('kickPublisher()', () => {
  test('calls DELETE on the correct MediaMTX path', async () => {
    await kickPublisher('sk_live_aabbccdd11223344');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://mediamtx:9997/v3/paths/kick/sk_live_aabbccdd11223344',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('does not throw when fetch rejects (network down)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(kickPublisher('sk_live_aabbccdd11223344')).resolves.toBeUndefined();
  });

  test('does not throw when MediaMTX returns non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(kickPublisher('sk_live_aabbccdd11223344')).resolves.toBeUndefined();
  });

  test('treats 404 (path not live) as success — no throw', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(kickPublisher('sk_live_aabbccdd11223344')).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. makeAuthHandler()
// ─────────────────────────────────────────────────────────────────────────────
describe('makeAuthHandler()', () => {
  function makeCtx(body) {
    const sent = [];
    const reply = {
      _status: null,
      status(code) { this._status = code; return this; },
      send(body)  { sent.push(body); return this; },
      sent,
    };
    return { request: { body }, reply };
  }

  test('allows read action without DB lookup', async () => {
    const handler = makeAuthHandler();
    const { request, reply } = makeCtx({ action: 'read', path: 'sk_live_anything' });
    await handler(request, reply);
    expect(reply._status).toBe(200);
    expect(reply.sent[0].result).toBe('allow');
  });

  test('allows publish when key is active in DB', async () => {
    // Seed an active key
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_5555555555555555' });

    const handler = makeAuthHandler();
    const { request, reply } = makeCtx({ action: 'publish', path: 'sk_live_5555555555555555' });
    await handler(request, reply);
    expect(reply._status).toBe(200);
    expect(reply.sent[0].result).toBe('allow');
  });

  test('denies publish when key is missing', async () => {
    const handler = makeAuthHandler();
    const { request, reply } = makeCtx({ action: 'publish', path: 'sk_live_nosuchkey0000000' });
    await handler(request, reply);
    expect(reply._status).toBe(401);
    expect(reply.sent[0].result).toBe('deny');
  });

  test('denies publish when key is revoked', async () => {
    await generate({ playerId: 'player-alpha-1', streamKeyOverride: 'sk_live_6666666666666666' });
    await revoke({ playerId: 'player-alpha-1' });

    const handler = makeAuthHandler();
    const { request, reply } = makeCtx({ action: 'publish', path: 'sk_live_6666666666666666' });
    await handler(request, reply);
    expect(reply._status).toBe(401);
    expect(reply.sent[0].result).toBe('deny');
  });

  test('denies publish when path is missing', async () => {
    const handler = makeAuthHandler();
    const { request, reply } = makeCtx({ action: 'publish' });
    await handler(request, reply);
    expect(reply._status).toBe(401);
    expect(reply.sent[0].result).toBe('deny');
  });
});
