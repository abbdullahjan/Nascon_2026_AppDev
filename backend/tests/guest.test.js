'use strict';
/**
 * Unit tests — guest module
 * Covers: 400 validation, 404 not found, 409 out-of-stock, successful merge,
 *         replay idempotency (total_items=1 not 2), GUEST_TOKEN_ALREADY_MERGED,
 *         403 GUEST_WRITE_FORBIDDEN from guestWriteGuard.
 */
process.env.DAY2_SALT = 'T01D27ad7ffff12e';
process.env.DAY1_SALT = 'demo-salt';
process.env.PORT      = '8080';

// DB state lives on global so the jest.mock factory (hoisted, no closure) can reach it
global.__DB__ = null;
function resetDB() {
  global.__DB__ = {
    players: { 'player-alpha-1': { player_id: 'player-alpha-1', name: 'Player Alpha 1' } },
    variants: {
      'var-jersey-001-L': { variant_id: 'var-jersey-001-L', price_minor: 450000, currency: 'PKR', stock: 5 },
      'var-jersey-001-M': { variant_id: 'var-jersey-001-M', price_minor: 450000, currency: 'PKR', stock: 1 },
    },
    guest_tokens: {
      'guest_anon_tok_7721': { token: 'guest_anon_tok_7721', merged: false, merged_into_user_id: null, merged_payload_hash: null },
    },
    persistent_carts: [],
  };
}

jest.mock('../src/config/db', () => {
  // makeChain builds a chainable query object reading/writing global.__DB__
  function makeChain(table) {
    const s = { f: {} };
    const c = {
      where(k, v) {
        if (typeof k === 'object') Object.assign(s.f, k);
        else if (typeof k === 'string' && v !== undefined) {
          s.f[k.includes('.') ? k.split('.').pop() : k] = v;
        }
        return c;
      },
      async first() {
        const db = global.__DB__; if (!db) return null; const f = s.f;
        if (table === 'players')          return db.players[f.player_id] || null;
        if (table === 'product_variants') return db.variants[f.variant_id] || null;
        if (table === 'guest_tokens')     return db.guest_tokens[f.token] || null;
        if (table === 'persistent_carts') return db.persistent_carts.find(r => r.user_id === f.user_id && r.variant_id === f.variant_id) || null;
        return null;
      },
      join() { return c; },
      async select() {
        const db = global.__DB__; if (!db) return [];
        if (table === 'persistent_carts') {
          const uid = s.f.user_id;
          const rows = uid ? db.persistent_carts.filter(r => r.user_id === uid) : [...db.persistent_carts];
          return rows.map(r => { const v = db.variants[r.variant_id] || { price_minor: 450000, currency: 'PKR' }; return { ...r, unit_price_minor: v.price_minor, currency: v.currency }; });
        }
        return [];
      },
      async update(data) {
        const db = global.__DB__; if (!db) return 1;
        if (table === 'guest_tokens') { const t = db.guest_tokens[s.f.token]; if (t) Object.assign(t, data); }
        if (table === 'persistent_carts') { const r = db.persistent_carts.find(row => row.user_id === s.f.user_id && row.variant_id === s.f.variant_id); if (r) Object.assign(r, data); }
        return 1;
      },
      async insert(row) {
        const db = global.__DB__; if (!db) return [1];
        if (table === 'guest_tokens')     db.guest_tokens[row.token] = { ...row };
        if (table === 'persistent_carts') db.persistent_carts.push({ ...row });
        return [1];
      },
      async truncate() { return undefined; },
      async increment(col, n) {
        const db = global.__DB__; if (!db) return 1;
        if (table === 'product_variants') { const v = db.variants[s.f.variant_id]; if (v) v[col] = (v[col] || 0) + n; }
        return 1;
      },
    };
    return c;
  }

  const mockDb = jest.fn((t) => makeChain(t));
  mockDb.transaction = jest.fn(async (cb) => {
    const trx = jest.fn((t) => makeChain(t));
    trx.raw = jest.fn(async (sql, params) => {
      const db = global.__DB__;
      if (db && sql && sql.includes('UPDATE product_variants') && params) {
        const [qty, vid] = params;
        if (db.variants[vid]) db.variants[vid].stock -= qty;
      }
      return { rowCount: 1 };
    });
    return cb(trx);
  });
  mockDb.raw = jest.fn(async () => ({ rowCount: 1 }));
  return mockDb;
});

const Fastify = require('fastify');
const { AppError } = require('../src/shared/errors');
const { registerRoutes } = require('../src/modules/guest/index');
const { guestWriteGuard } = require('../src/middleware/guestGuard');

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.status(err.httpStatus).send({ error: { code: err.errorCode, message: err.message, details: err.details } });
    reply.status(err.statusCode || 500).send({ error: { code: 'INTERNAL_ERROR', message: err.message, details: {} } });
  });
  app.post('/test-guard', { preHandler: [guestWriteGuard] }, async () => ({ ok: true }));
  await registerRoutes(app);
  await app.ready();
  return app;
}

let app;
beforeAll(async () => { app = await buildApp(); });
afterAll(async ()  => { await app.close(); });
beforeEach(() => resetDB());

const URL = '/audit/v1/guest/cart-merge';
const BASE = { guest_token: 'guest_anon_tok_7721', registered_user_id: 'player-alpha-1', guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }], test_write_block: true };
const body = (o = {}) => ({ ...BASE, ...o });

// 1 ─ 400 validation ──────────────────────────────────────────────────────────
describe('400 VALIDATION_ERROR', () => {
  test('missing guest_token', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: { registered_user_id: 'player-alpha-1', guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }] } });
    expect(r.statusCode).toBe(400); expect(JSON.parse(r.payload).error.code).toBe('VALIDATION_ERROR');
  });
  test('missing registered_user_id', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: { guest_token: 'guest_anon_tok_7721', guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }] } });
    expect(r.statusCode).toBe(400); expect(JSON.parse(r.payload).error.code).toBe('VALIDATION_ERROR');
  });
  test('empty guest_cart', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: body({ guest_cart: [] }) });
    expect(r.statusCode).toBe(400); expect(JSON.parse(r.payload).error.code).toBe('VALIDATION_ERROR');
  });
  test('guest_token not starting with guest_', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: body({ guest_token: 'regular_tok' }) });
    expect(r.statusCode).toBe(400); expect(JSON.parse(r.payload).error.code).toBe('VALIDATION_ERROR');
  });
  test('item quantity < 1', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: body({ guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 0 }] }) });
    expect(r.statusCode).toBe(400); expect(JSON.parse(r.payload).error.code).toBe('VALIDATION_ERROR');
  });
});

// 2 ─ 404 ─────────────────────────────────────────────────────────────────────
describe('404 NOT_FOUND', () => {
  test('unknown player → PLAYER_NOT_FOUND', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: body({ registered_user_id: 'ghost' }) });
    expect(r.statusCode).toBe(404); expect(JSON.parse(r.payload).error.code).toBe('PLAYER_NOT_FOUND');
  });
  test('unknown variant → VARIANT_NOT_FOUND', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: body({ guest_cart: [{ variant_id: 'var-ghost', quantity: 1 }] }) });
    expect(r.statusCode).toBe(404); expect(JSON.parse(r.payload).error.code).toBe('VARIANT_NOT_FOUND');
  });
});

// 3 ─ 409 OUT_OF_STOCK ────────────────────────────────────────────────────────
describe('409 OUT_OF_STOCK', () => {
  test('qty > stock → OUT_OF_STOCK with variant_id detail', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: body({ guest_cart: [{ variant_id: 'var-jersey-001-M', quantity: 2 }] }) });
    expect(r.statusCode).toBe(409);
    const b = JSON.parse(r.payload);
    expect(b.error.code).toBe('OUT_OF_STOCK');
    expect(b.error.details.variant_id).toBe('var-jersey-001-M');
  });
});

// 4 ─ Successful merge ────────────────────────────────────────────────────────
describe('Successful merge', () => {
  test('200, cart_merged=true, total_items=1', async () => {
    const r = await app.inject({ method: 'POST', url: URL, payload: body() });
    expect(r.statusCode).toBe(200);
    const b = JSON.parse(r.payload);
    expect(b.cart_merged).toBe(true);
    expect(b.active_cart.total_items).toBe(1);
    expect(b.guest_token).toBe('guest_anon_tok_7721');
  });
  test('write_block_verified=true, write_rejection_code=403', async () => {
    const b = JSON.parse((await app.inject({ method: 'POST', url: URL, payload: body() })).payload);
    expect(b.write_block_verified).toBe(true);
    expect(b.write_rejection_code).toBe(403);
  });
  test('write_block_verified=false when test_write_block=false', async () => {
    const b = JSON.parse((await app.inject({ method: 'POST', url: URL, payload: body({ test_write_block: false }) })).payload);
    expect(b.write_block_verified).toBe(false);
  });
  test('signature is 64 hex chars', async () => {
    const b = JSON.parse((await app.inject({ method: 'POST', url: URL, payload: body() })).payload);
    expect(b.signature).toMatch(/^[0-9a-f]{64}$/);
  });
  test('active_cart items correct', async () => {
    const b = JSON.parse((await app.inject({ method: 'POST', url: URL, payload: body() })).payload);
    expect(b.active_cart.items[0].variant_id).toBe('var-jersey-001-L');
    expect(b.active_cart.items[0].quantity).toBe(1);
    expect(b.active_cart.items[0].unit_price_minor).toBe(450000);
    expect(b.active_cart.subtotal_minor).toBe(450000);
    expect(b.active_cart.currency).toBe('PKR');
  });
});

// 5 ─ Replay idempotency ───────────────────────────────────────────────────────
describe('Replay idempotency (spec edge case 4)', () => {
  test('second identical call: total_items=1, not 2', async () => {
    const payload = body();
    const r1 = await app.inject({ method: 'POST', url: URL, payload });
    expect(r1.statusCode).toBe(200);
    expect(JSON.parse(r1.payload).active_cart.total_items).toBe(1);

    const r2 = await app.inject({ method: 'POST', url: URL, payload });
    expect(r2.statusCode).toBe(200);
    const b2 = JSON.parse(r2.payload);
    expect(b2.cart_merged).toBe(true);
    expect(b2.active_cart.total_items).toBe(1); // must stay 1, never 2
  });
});

// 6 ─ GUEST_TOKEN_ALREADY_MERGED ──────────────────────────────────────────────
describe('GUEST_TOKEN_ALREADY_MERGED', () => {
  test('same token, different user → 409', async () => {
    await app.inject({ method: 'POST', url: URL, payload: body() }); // first merge
    global.__DB__.players['player-alpha-2'] = { player_id: 'player-alpha-2', name: 'Player Alpha 2' };
    const r = await app.inject({ method: 'POST', url: URL, payload: body({ registered_user_id: 'player-alpha-2' }) });
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.payload).error.code).toBe('GUEST_TOKEN_ALREADY_MERGED');
  });
});

// 7 ─ guestWriteGuard: 403 GUEST_WRITE_FORBIDDEN ──────────────────────────────
describe('guestWriteGuard', () => {
  test('guest_anon_tok_* → 403 GUEST_WRITE_FORBIDDEN', async () => {
    const r = await app.inject({ method: 'POST', url: '/test-guard', headers: { authorization: 'Bearer guest_anon_tok_7721' }, payload: {} });
    expect(r.statusCode).toBe(403);
    const b = JSON.parse(r.payload);
    expect(b.error.code).toBe('GUEST_WRITE_FORBIDDEN');
    expect(b.error.details.guest_token).toBe('guest_anon_tok_7721');
  });
  test('no Authorization header → 200 pass-through', async () => {
    const r = await app.inject({ method: 'POST', url: '/test-guard', payload: {} });
    expect(r.statusCode).toBe(200);
  });
  test('non-guest Bearer → 200 pass-through', async () => {
    const r = await app.inject({ method: 'POST', url: '/test-guard', headers: { authorization: 'Bearer some_jwt_token' }, payload: {} });
    expect(r.statusCode).toBe(200);
  });
});
