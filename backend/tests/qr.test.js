'use strict';

/**
 * Unit tests — QR module
 * Covers: 404 QR_NOT_FOUND, short_url stable, redirect 302,
 *         3 export formats (SVG/PNG/PDF), applyMatchEvent match_end.
 *
 * All DB and Redis calls are mocked — no real Postgres/Redis.
 */

// ── Set env vars before any require ─────────────────────────────────────────
process.env.DAY2_SALT = 'T01D27ad7ffff12e';
process.env.DAY1_SALT = 'demo-salt';
process.env.PORT      = '8080';

// ── Mock knex db ─────────────────────────────────────────────────────────────
// We intercept require('../../config/db') inside the module under test.
jest.mock('../src/config/db', () => {
  const mockDb = jest.fn();

  // Baseline seed rows
  const QR_ROWS = {
    'match-m1': {
      entity_id:   'match-m1',
      entity_type: 'match',
      short_code:  'm1-live',
      short_url:   'http://localhost:8080/q/m1-live',
      scan_count:  0,
    },
    'player-alpha-1': {
      entity_id:   'player-alpha-1',
      entity_type: 'player',
      short_code:  'p-alpha-1',
      short_url:   'http://localhost:8080/q/p-alpha-1',
      scan_count:  0,
    },
    'club-alpha-1': {
      entity_id:   'club-alpha-1',
      entity_type: 'club',
      short_code:  'c-alpha-1',
      short_url:   'http://localhost:8080/q/c-alpha-1',
      scan_count:  0,
    },
  };

  const SHORT_CODE_INDEX = Object.fromEntries(
    Object.values(QR_ROWS).map((r) => [r.short_code, r])
  );

  // Chainable query builder stub
  function makeChain(rows) {
    const chain = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(rows[0] ?? null),
      insert: jest.fn().mockResolvedValue([1]),
      truncate: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(1),
      forUpdate: jest.fn().mockReturnThis(),
    };
    return chain;
  }

  // mockDb('qr_mappings') returns the right row based on .where() arg
  mockDb.mockImplementation((table) => {
    if (table === 'qr_mappings') {
      const chain = {
        where: jest.fn((filter) => {
          let match = null;
          if (filter.entity_id) match = QR_ROWS[filter.entity_id] || null;
          if (filter.short_code) match = SHORT_CODE_INDEX[filter.short_code] || null;
          return {
            first:     jest.fn().mockResolvedValue(match),
            truncate:  jest.fn().mockResolvedValue(undefined),
            increment: jest.fn().mockResolvedValue(1),
            forUpdate: jest.fn().mockReturnThis(),
          };
        }),
        truncate: jest.fn().mockResolvedValue(undefined),
        increment: jest.fn().mockResolvedValue(1),
      };
      return chain;
    }
    if (table === 'qr_scan_events') {
      return makeChain([]);
    }
    return makeChain([]);
  });

  // transaction mock — executes callback synchronously with a trx proxy
  mockDb.transaction = jest.fn(async (cb) => {
    const trx = jest.fn((table) => {
      const chain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue([1]),
        truncate: jest.fn().mockResolvedValue(undefined),
        increment: jest.fn().mockResolvedValue(1),
        forUpdate: jest.fn().mockReturnThis(),
      };
      return chain;
    });
    return cb(trx);
  });

  return mockDb;
});

// ── Build Fastify app with only the QR module ────────────────────────────────
const Fastify = require('fastify');
const { AppError } = require('../src/shared/errors');
const { registerRoutes } = require('../src/modules/qr/index');
const { applyMatchEvent } = require('../src/modules/qr/matchStatus');

async function buildApp() {
  const app = Fastify({ logger: false });

  // Mirror the global error handler from app.js
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.httpStatus).send({
        error: { code: error.errorCode, message: error.message, details: error.details },
      });
    }
    reply.status(error.statusCode || 500).send({
      error: { code: 'INTERNAL_ERROR', message: error.message, details: {} },
    });
  });

  await registerRoutes(app);
  await app.ready();
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

let app;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. 404 QR_NOT_FOUND
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /audit/v1/qr/:entity_id — 404', () => {
  test('unknown entity_id returns 404 QR_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/audit/v1/qr/does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('QR_NOT_FOUND');
    expect(body.error.details.entity_id).toBe('does-not-exist');
  });

  test('unknown short_code on /q/:short_code returns 404 QR_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/q/no-such-code',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('QR_NOT_FOUND');
    expect(body.error.details.short_code).toBe('no-such-code');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. short_url is stable across two calls
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /audit/v1/qr/:entity_id — short_url stability', () => {
  test('short_url is identical across two successive calls', async () => {
    const call1 = await app.inject({ method: 'GET', url: '/audit/v1/qr/match-m1' });
    const call2 = await app.inject({ method: 'GET', url: '/audit/v1/qr/match-m1' });

    expect(call1.statusCode).toBe(200);
    expect(call2.statusCode).toBe(200);

    const b1 = JSON.parse(call1.payload);
    const b2 = JSON.parse(call2.payload);

    expect(b1.short_url).toBe('http://localhost:8080/q/m1-live');
    expect(b1.short_url).toBe(b2.short_url);
  });

  test('response contains entity_id, entity_type, short_url, target_route, signature, scan_count', async () => {
    const res  = await app.inject({ method: 'GET', url: '/audit/v1/qr/match-m1' });
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('entity_id',   'match-m1');
    expect(body).toHaveProperty('entity_type', 'match');
    expect(body).toHaveProperty('short_url');
    expect(body).toHaveProperty('target_route');
    expect(body).toHaveProperty('signature');
    expect(body).toHaveProperty('scan_count');
  });

  test('target_route for match entity points to /api/v1/matches/:id', async () => {
    const res  = await app.inject({ method: 'GET', url: '/audit/v1/qr/match-m1' });
    const body = JSON.parse(res.payload);
    expect(body.target_route).toBe('/api/v1/matches/match-m1');
  });

  test('?inspect=true returns same response as without param', async () => {
    const plain   = await app.inject({ method: 'GET', url: '/audit/v1/qr/match-m1' });
    const inspect = await app.inject({ method: 'GET', url: '/audit/v1/qr/match-m1?inspect=true' });
    expect(plain.statusCode).toBe(200);
    expect(inspect.statusCode).toBe(200);
    const b1 = JSON.parse(plain.payload);
    const b2 = JSON.parse(inspect.payload);
    expect(b1.short_url).toBe(b2.short_url);
    expect(b1.signature).toBe(b2.signature);
  });

  test('signature is 64 lowercase hex chars', async () => {
    const res  = await app.inject({ method: 'GET', url: '/audit/v1/qr/player-alpha-1' });
    const body = JSON.parse(res.payload);
    expect(body.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Redirect 302 on /q/:short_code
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /q/:short_code — redirect', () => {
  test('known short_code returns 302 with Location header', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/q/m1-live',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toBe('/api/v1/matches/match-m1');
  });

  test('redirect Location matches dynamic target_route for player', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/q/p-alpha-1',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toBe('/api/v1/players/player-alpha-1');
  });

  test('redirect Location matches dynamic target_route for club', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/q/c-alpha-1',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toBe('/api/v1/clubs/club-alpha-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Export formats
// ─────────────────────────────────────────────────────────────────────────────
describe('Export formats', () => {
  test('SVG export: 200, image/svg+xml, body contains <svg', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/audit/v1/qr/match-m1/export.svg',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(res.payload).toContain('<svg');
  });

  test('PNG export: 200, image/png, valid PNG magic header (\\x89PNG)', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/audit/v1/qr/match-m1/export.png',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    // PNG magic: first 4 bytes are 0x89 0x50 0x4E 0x47
    const buf = Buffer.from(res.rawPayload);
    expect(buf[0]).toBe(0x89);
    expect(buf.slice(1, 4).toString('ascii')).toBe('PNG');
  });

  test('PDF export: 200, application/pdf, starts with %PDF-, contains entity_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/audit/v1/qr/match-m1/export.pdf',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    // %PDF- header (latin1 so binary bytes don't mangle the ASCII prefix)
    const pdfStr = Buffer.from(res.rawPayload).toString('latin1');
    expect(pdfStr).toMatch(/^%PDF-/);
    // entity_id must appear somewhere in the uncompressed PDF stream
    expect(pdfStr).toContain('match-m1');
  });

  test('export 404 for unknown entity_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/audit/v1/qr/ghost-entity/export.svg',
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload).error.code).toBe('QR_NOT_FOUND');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. applyMatchEvent — spec 8.2
// ─────────────────────────────────────────────────────────────────────────────
describe('applyMatchEvent()', () => {
  test('match_end → completed', () => {
    expect(applyMatchEvent({ type: 'match_end' })).toBe('completed');
  });

  test('postponed → postponed', () => {
    expect(applyMatchEvent({ type: 'postponed' })).toBe('postponed');
  });

  test('match_start → in_progress', () => {
    expect(applyMatchEvent({ type: 'match_start' })).toBe('in_progress');
  });

  test('resumed → in_progress', () => {
    expect(applyMatchEvent({ type: 'resumed' })).toBe('in_progress');
  });

  test('cancelled → cancelled', () => {
    expect(applyMatchEvent({ type: 'cancelled' })).toBe('cancelled');
  });

  test('suspended → suspended', () => {
    expect(applyMatchEvent({ type: 'suspended' })).toBe('suspended');
  });

  test('unknown event type → null', () => {
    expect(applyMatchEvent({ type: 'some_unknown_event' })).toBeNull();
  });

  test('null input → null', () => {
    expect(applyMatchEvent(null)).toBeNull();
  });

  test('missing type field → null', () => {
    expect(applyMatchEvent({})).toBeNull();
  });
});
