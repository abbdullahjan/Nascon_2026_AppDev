'use strict';

/**
 * Module: realtime
 * Owner: Ahmed (Person B)
 *
 * Routes registered:
 *   WS   ws://localhost:8080/ws/matches/:match_id       — live score push (NFR-1)
 *   GET  /api/v1/matches/:match_id/stream               — SSE live score
 *   GET  /metrics                                        — Prometheus (NFR-6)
 *
 * Broadcast hook:
 *   POST /audit/v1/events is owned by Phase I routes/events.js.
 *   We attach a Fastify onSend lifecycle hook scoped to that path so that
 *   after Phase I sends its 201/200 response we fire buildAndBroadcast()
 *   asynchronously. The HTTP response is never delayed.
 */

const fastifyWebsocket               = require('@fastify/websocket');
const store                          = require('./store');
const { broadcast, startSubscriber,
        shutdown }                   = require('./broadcaster');
const { buildAndBroadcast }          = require('./eventsHandler');
const { buildMetricsText }           = require('./metricsHandler');

// ─────────────────────────────────────────────────────────────────────────────
async function registerRoutes(app) {

  // ── 1. Register WebSocket plugin (idempotent — Fastify ignores double-register) ──
  if (!app.hasPlugin('@fastify/websocket')) {
    await app.register(fastifyWebsocket);
  }

  // ── 2. Start Redis psubscribe fan-out ───────────────────────────────────────
  await startSubscriber();

  // ── 3. Broadcast hook on POST /audit/v1/events ─────────────────────────────
  // We attach a route-level onSend hook. Fastify calls it AFTER the Phase I
  // handler has already serialised and is about to flush the response.
  // We fire-and-forget — never await inside onSend so latency is unaffected.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method === 'POST' && request.url === '/audit/v1/events') {
      const statusCode = reply.statusCode;
      // Only broadcast on successful appends (201 = new, 200 = replay)
      if (statusCode === 201 || statusCode === 200) {
        // Fire-and-forget — never block the response
        setImmediate(() => buildAndBroadcast(payload));
      }
    }
    return payload; // must return payload unchanged
  });

  // ── 4. WebSocket endpoint — ws://localhost:8080/ws/matches/:match_id ────────
  app.get('/ws/matches/:match_id', { websocket: true }, (socket, request) => {
    const { match_id } = request.params;

    store.addWsClient(match_id, socket);

    // Send an immediate "connected" confirmation so clients know they're live
    socket.send(JSON.stringify({
      type:     'connected',
      match_id,
      message:  'Subscribed to live score updates.',
    }));

    socket.on('close', () => {
      store.removeWsClient(match_id, socket);
    });

    socket.on('error', () => {
      store.removeWsClient(match_id, socket);
    });

    // Clients send pings to keep alive — we echo a pong
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch { /* ignore malformed frames */ }
    });
  });

  // ── 5. SSE endpoint — GET /api/v1/matches/:match_id/stream ─────────────────
  app.get('/api/v1/matches/:match_id/stream', async (request, reply) => {
    const { match_id } = request.params;

    // SSE headers
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering if behind proxy
    });

    // Send an initial "connected" event
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', match_id })}\n\n`);

    store.addSseClient(match_id, reply);

    // Keep-alive ping every 15 s so proxies don't close the connection
    const pingInterval = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        clearInterval(pingInterval);
      }
    }, 15_000);

    request.raw.on('close', () => {
      clearInterval(pingInterval);
      store.removeSseClient(match_id, reply);
    });

    // Return a promise that never resolves — keeps the connection open
    return new Promise(() => {});
  });

  // ── 6. Prometheus metrics — GET /metrics ────────────────────────────────────
  // Spec 5.9: Content-Type must be exactly "text/plain; version=0.0.4"
  app.get('/metrics', async (request, reply) => {
    const text = await buildMetricsText();
    reply
      .header('Content-Type', 'text/plain; version=0.0.4')
      .status(200)
      .send(text);
  });

  // ── 7. Graceful shutdown ────────────────────────────────────────────────────
  app.addHook('onClose', async () => {
    await shutdown();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
async function reset(trx) {
  // Flush all in-memory WS/SSE state and reset metric counters.
  // Redis pub/sub channels drain naturally when clients disconnect.
  store.resetStore();
}

async function seed(trx) {
  // No DB seed required — realtime state is ephemeral.
}

module.exports = { registerRoutes, reset, seed };
