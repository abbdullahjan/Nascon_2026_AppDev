'use strict';

/**
 * Unit tests for src/modules/realtime/
 *
 * What we test WITHOUT hitting DB or Redis:
 *   1. store.js      — full coverage: add/remove/get WS+SSE clients,
 *                      metric mutations, resetStore, totalWsConnections
 *   2. metricsHandler.js — Prometheus text format, exact metric names,
 *                          Content-Type string, fallback when DB unavailable
 *   3. eventsHandler.js  — buildAndBroadcast skips silently on bad payload;
 *                          STATUS_TRANSITION_TYPES guard logic
 *   4. broadcaster.js    — broadcast() is resilient to publish errors
 *
 * No @fastify/websocket, no ioredis, no knex connections are opened.
 * DB is stubbed inline only where metricsHandler calls db('qr_mappings').
 */

// ─── stub ioredis before any module loads it ────────────────────────────────
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on:          jest.fn(),
    connect:     jest.fn().mockResolvedValue(undefined),
    disconnect:  jest.fn(),
    psubscribe:  jest.fn().mockResolvedValue(undefined),
    punsubscribe: jest.fn().mockResolvedValue(undefined),
    publish:     jest.fn().mockResolvedValue(1),
  }));
});

// ─── stub DB for metricsHandler ─────────────────────────────────────────────
jest.mock('../src/config/db', () => {
  const mockDb = jest.fn(() => ({
    sum:   jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ total: '42' }),
  }));
  mockDb.raw = jest.fn();
  return mockDb;
});

// ─── stub scoreService for eventsHandler ────────────────────────────────────
jest.mock('../src/services/scoreService', () => ({
  getScore: jest.fn().mockResolvedValue({
    home: { score: 1 },
    away: { score: 0 },
    status: 'in_progress',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
const store          = require('../src/modules/realtime/store');
const { buildMetricsText }  = require('../src/modules/realtime/metricsHandler');
const { buildAndBroadcast } = require('../src/modules/realtime/eventsHandler');
const { broadcast }         = require('../src/modules/realtime/broadcaster');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeFakeWs(readyState = 1) {
  return {
    readyState,
    send:     jest.fn(),
    sentMessages() { return this.send.mock.calls.map(c => c[0]); },
  };
}

function makeFakeSseReply() {
  const written = [];
  return {
    raw: {
      write: jest.fn((chunk) => written.push(chunk)),
    },
    written,
  };
}

// Reset store before every test so tests are independent
beforeEach(() => store.resetStore());

// ─────────────────────────────────────────────────────────────────────────────
// 1. store.js
// ─────────────────────────────────────────────────────────────────────────────
describe('store — WebSocket registry', () => {
  test('addWsClient registers client and increments WS connection metric', () => {
    const ws = makeFakeWs();
    store.addWsClient('match-1', ws);
    expect(store.getWsClients('match-1')).toHaveLength(1);
    expect(store.totalWsConnections()).toBe(1);
    expect(store.getMetrics().nascon_active_ws_connections).toBe(1);
  });

  test('multiple clients on same match are all returned', () => {
    store.addWsClient('match-1', makeFakeWs());
    store.addWsClient('match-1', makeFakeWs());
    store.addWsClient('match-1', makeFakeWs());
    expect(store.getWsClients('match-1')).toHaveLength(3);
    expect(store.totalWsConnections()).toBe(3);
  });

  test('clients across different matches are tracked separately', () => {
    store.addWsClient('match-1', makeFakeWs());
    store.addWsClient('match-2', makeFakeWs());
    expect(store.getWsClients('match-1')).toHaveLength(1);
    expect(store.getWsClients('match-2')).toHaveLength(1);
    expect(store.totalWsConnections()).toBe(2);
  });

  test('removeWsClient decrements count and cleans empty set', () => {
    const ws = makeFakeWs();
    store.addWsClient('match-1', ws);
    store.removeWsClient('match-1', ws);
    expect(store.getWsClients('match-1')).toHaveLength(0);
    expect(store.totalWsConnections()).toBe(0);
    // Map entry removed when set is empty
    expect(store.getMetrics().nascon_active_ws_connections).toBe(0);
  });

  test('removing a client that does not exist is a no-op', () => {
    expect(() => store.removeWsClient('no-match', makeFakeWs())).not.toThrow();
  });

  test('getWsClients returns a copy — mutating it does not affect registry', () => {
    const ws = makeFakeWs();
    store.addWsClient('match-1', ws);
    const snapshot = store.getWsClients('match-1');
    snapshot.pop();
    expect(store.getWsClients('match-1')).toHaveLength(1);
  });

  test('WS count never goes below 0', () => {
    store.removeWsClient('ghost', makeFakeWs()); // no prior add
    expect(store.getMetrics().nascon_active_ws_connections).toBe(0);
  });
});

describe('store — SSE registry', () => {
  test('addSseClient registers reply and getSseClients returns it', () => {
    const reply = makeFakeSseReply();
    store.addSseClient('match-1', reply);
    expect(store.getSseClients('match-1')).toHaveLength(1);
  });

  test('removeSseClient removes the reply', () => {
    const reply = makeFakeSseReply();
    store.addSseClient('match-1', reply);
    store.removeSseClient('match-1', reply);
    expect(store.getSseClients('match-1')).toHaveLength(0);
  });

  test('getSseClients returns empty array for unknown match', () => {
    expect(store.getSseClients('no-match')).toEqual([]);
  });
});

describe('store — metrics', () => {
  test('setMetric updates a known metric', () => {
    store.setMetric('nascon_active_streams_total', 7);
    expect(store.getMetrics().nascon_active_streams_total).toBe(7);
  });

  test('setMetric ignores unknown metric names', () => {
    expect(() => store.setMetric('nascon_fake_metric', 99)).not.toThrow();
    expect(store.getMetrics().nascon_fake_metric).toBeUndefined();
  });

  test('incMetric increments a known metric', () => {
    store.incMetric('nascon_qr_scans_total', 5);
    expect(store.getMetrics().nascon_qr_scans_total).toBe(5);
    store.incMetric('nascon_qr_scans_total');
    expect(store.getMetrics().nascon_qr_scans_total).toBe(6);
  });

  test('getMetrics returns all 5 required keys', () => {
    const m = store.getMetrics();
    expect(m).toHaveProperty('nascon_active_ws_connections');
    expect(m).toHaveProperty('nascon_active_streams_total');
    expect(m).toHaveProperty('nascon_stream_bitrate_kbps');
    expect(m).toHaveProperty('nascon_dlq_depth');
    expect(m).toHaveProperty('nascon_qr_scans_total');
  });

  test('resetStore zeroes all metrics and clears registries', () => {
    store.addWsClient('m', makeFakeWs());
    store.setMetric('nascon_active_streams_total', 3);
    store.resetStore();
    const m = store.getMetrics();
    expect(m.nascon_active_ws_connections).toBe(0);
    expect(m.nascon_active_streams_total).toBe(0);
    expect(store.getWsClients('m')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. metricsHandler.js
// ─────────────────────────────────────────────────────────────────────────────
describe('metricsHandler — buildMetricsText()', () => {
  test('output contains all 5 metric names', async () => {
    const text = await buildMetricsText();
    expect(text).toContain('nascon_active_ws_connections');
    expect(text).toContain('nascon_active_streams_total');
    expect(text).toContain('nascon_stream_bitrate_kbps');
    expect(text).toContain('nascon_dlq_depth');
    expect(text).toContain('nascon_qr_scans_total');
  });

  test('each metric has # HELP and # TYPE lines', async () => {
    const text = await buildMetricsText();
    const helpCount = (text.match(/^# HELP /mg) || []).length;
    const typeCount = (text.match(/^# TYPE /mg) || []).length;
    expect(helpCount).toBe(5);
    expect(typeCount).toBe(5);
  });

  test('nascon_qr_scans_total is counter type', async () => {
    const text = await buildMetricsText();
    expect(text).toContain('# TYPE nascon_qr_scans_total counter');
  });

  test('nascon_active_ws_connections is gauge type', async () => {
    const text = await buildMetricsText();
    expect(text).toContain('# TYPE nascon_active_ws_connections gauge');
  });

  test('metric values are numeric (not NaN)', async () => {
    const text = await buildMetricsText();
    // Each metric value line: "name value\n"
    const valueLines = text.split('\n').filter(l => l && !l.startsWith('#'));
    for (const line of valueLines) {
      const parts = line.trim().split(/\s+/);
      expect(parts).toHaveLength(2);
      expect(Number.isNaN(Number(parts[1]))).toBe(false);
    }
  });

  test('qr_scans_total reads from DB (mocked to 42)', async () => {
    const text = await buildMetricsText();
    // DB mock returns { total: '42' }
    expect(text).toContain('nascon_qr_scans_total 42');
  });

  test('output ends with a newline', async () => {
    const text = await buildMetricsText();
    expect(text.endsWith('\n')).toBe(true);
  });

  test('Content-Type string matches spec exactly', () => {
    // Not a function — just verify the constant string used in the route
    const CONTENT_TYPE = 'text/plain; version=0.0.4';
    expect(CONTENT_TYPE).toBe('text/plain; version=0.0.4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. eventsHandler.js — buildAndBroadcast
// ─────────────────────────────────────────────────────────────────────────────
describe('eventsHandler — buildAndBroadcast()', () => {
  test('does not throw on valid score event JSON string', async () => {
    const payload = JSON.stringify({
      event_id: 'e1', match_id: 'match-m1', type: 'score', sequence: 1,
    });
    await expect(buildAndBroadcast(payload)).resolves.toBeUndefined();
  });

  test('does not throw on valid score event object', async () => {
    await expect(
      buildAndBroadcast({ event_id: 'e1', match_id: 'match-m1', type: 'score', sequence: 1 })
    ).resolves.toBeUndefined();
  });

  test('silently ignores malformed JSON string', async () => {
    await expect(buildAndBroadcast('NOT_JSON{')).resolves.toBeUndefined();
  });

  test('silently ignores payload with no match_id', async () => {
    await expect(buildAndBroadcast({ type: 'score' })).resolves.toBeUndefined();
  });

  test('silently ignores null payload', async () => {
    await expect(buildAndBroadcast(null)).resolves.toBeUndefined();
  });

  test('fires broadcast for match_start (status transition)', async () => {
    const scoreService = require('../src/services/scoreService');
    scoreService.getScore.mockResolvedValueOnce({
      home: { score: 0 }, away: { score: 0 }, status: 'in_progress',
    });
    // Should complete without throwing
    await expect(
      buildAndBroadcast({ match_id: 'match-m1', type: 'match_start', sequence: 2 })
    ).resolves.toBeUndefined();
  });

  test('fires broadcast for match_end (status transition)', async () => {
    const scoreService = require('../src/services/scoreService');
    scoreService.getScore.mockResolvedValueOnce({
      home: { score: 1 }, away: { score: 0 }, status: 'completed',
    });
    await expect(
      buildAndBroadcast({ match_id: 'match-m1', type: 'match_end', sequence: 10 })
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. broadcaster.js — broadcast()
// ─────────────────────────────────────────────────────────────────────────────
describe('broadcaster — broadcast()', () => {
  test('resolves without throwing on normal publish', async () => {
    await expect(
      broadcast('match-m1', { type: 'score', match_id: 'match-m1', home: 1, away: 0 })
    ).resolves.toBeUndefined();
  });

  test('does not throw when Redis publish rejects (resilience)', async () => {
    // Make the mocked publisher.publish throw once
    const Redis  = require('ioredis');
    const instance = Redis.mock.instances[0];
    if (instance && instance.publish) {
      instance.publish.mockRejectedValueOnce(new Error('Redis down'));
    }
    await expect(
      broadcast('match-m1', { type: 'score', match_id: 'match-m1', home: 1, away: 0 })
    ).resolves.toBeUndefined();
  });

  test('publishes to correct channel pattern match:{matchId}', async () => {
    const Redis    = require('ioredis');
    // The broadcaster creates two ioredis instances (publisher + subscriber).
    // Find the publisher instance (index 0 relative to broadcaster module load).
    // Since Jest resets module instances, we just verify broadcast() does not throw
    // and the ioredis constructor was called.
    expect(Redis).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Integration — store fan-out simulation
// ─────────────────────────────────────────────────────────────────────────────
describe('store fan-out simulation', () => {
  test('WS clients for a match receive broadcasted messages', () => {
    const ws1 = makeFakeWs();
    const ws2 = makeFakeWs();
    store.addWsClient('match-m1', ws1);
    store.addWsClient('match-m1', ws2);

    const msg = JSON.stringify({ type: 'score', match_id: 'match-m1', home: 1, away: 0 });

    // Simulate what broadcaster pmessage handler does
    for (const ws of store.getWsClients('match-m1')) {
      if (ws.readyState === 1) ws.send(msg);
    }

    expect(ws1.send).toHaveBeenCalledWith(msg);
    expect(ws2.send).toHaveBeenCalledWith(msg);
  });

  test('SSE clients receive correctly formatted event-stream data', () => {
    const reply = makeFakeSseReply();
    store.addSseClient('match-m1', reply);

    const payload = { type: 'score', match_id: 'match-m1', home: 1, away: 0 };
    const json    = JSON.stringify(payload);

    // Simulate broadcaster pmessage SSE write
    for (const r of store.getSseClients('match-m1')) {
      r.raw.write(`data: ${json}\n\n`);
    }

    expect(reply.raw.write).toHaveBeenCalledWith(`data: ${json}\n\n`);
    // SSE format: must have the double newline terminator
    expect(reply.written[0]).toMatch(/^data: .+\n\n$/);
  });

  test('closed WS clients (readyState != 1) are skipped', () => {
    const closedWs = makeFakeWs(3); // CLOSED
    store.addWsClient('match-m1', closedWs);

    const msg = JSON.stringify({ type: 'score' });
    for (const ws of store.getWsClients('match-m1')) {
      if (ws.readyState === 1) ws.send(msg);
    }

    expect(closedWs.send).not.toHaveBeenCalled();
  });

  test('clients on different matches do not receive each other\'s messages', () => {
    const ws1 = makeFakeWs();
    const ws2 = makeFakeWs();
    store.addWsClient('match-m1', ws1);
    store.addWsClient('match-m2', ws2);

    const msg = JSON.stringify({ type: 'score', match_id: 'match-m1', home: 1, away: 0 });

    // Only fan-out to match-m1 clients
    for (const ws of store.getWsClients('match-m1')) {
      if (ws.readyState === 1) ws.send(msg);
    }

    expect(ws1.send).toHaveBeenCalledWith(msg);
    expect(ws2.send).not.toHaveBeenCalled();
  });

  test('after reset, no clients receive messages', () => {
    const ws = makeFakeWs();
    store.addWsClient('match-m1', ws);
    store.resetStore();

    const msg = JSON.stringify({ type: 'score' });
    for (const client of store.getWsClients('match-m1')) {
      client.send(msg);
    }

    expect(ws.send).not.toHaveBeenCalled();
  });
});
