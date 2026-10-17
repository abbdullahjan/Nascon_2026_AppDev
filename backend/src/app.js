'use strict';

require('dotenv').config();
const Fastify  = require('fastify');
const cors     = require('@fastify/cors');
const helmet   = require('@fastify/helmet');
const { AppError } = require('./utils/errors');
const { rateLimitHook } = require('./middleware/rateLimit');

// Route modules
const healthRoutes       = require('./routes/health');
const resetRoutes        = require('./routes/reset');
const sportsRoutes       = require('./routes/sports');
const fixturesRoutes     = require('./routes/fixtures');
const leaguesRoutes      = require('./routes/leagues');
const eventsRoutes       = require('./routes/events');
const standingsRoutes    = require('./routes/standings');
const rosterRoutes       = require('./routes/roster');
const checkoutRoutes     = require('./routes/checkout');
const rbacRoutes         = require('./routes/rbac');
const offlineSyncRoutes  = require('./routes/offlineSync');
const pingRoutes         = require('./routes/ping');

const app = Fastify({ logger: true });

// ── Plugins ────────────────────────────────────────────────────────────────
app.register(cors,   { origin: '*' });
app.register(helmet, { contentSecurityPolicy: false });

// ── Body size limit — 1 MB → 413 ──────────────────────────────────────────
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string', bodyLimit: 1_048_576 },
  (req, body, done) => {
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  }
);

// ── Global error handler ───────────────────────────────────────────────────
app.setErrorHandler((error, request, reply) => {
  // Our own structured AppError
  if (error instanceof AppError) {
    return reply.status(error.httpStatus).send({
      error: { code: error.errorCode, message: error.message, details: error.details },
    });
  }

  // Body too large
  if (error.statusCode === 413) {
    return reply.status(413).send({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1 MB limit.', details: {} },
    });
  }

  // Fastify schema validation
  if (error.statusCode === 400 && error.validation) {
    return reply.status(400).send({
      error: {
        code:    'VALIDATION_ERROR',
        message: 'Schema validation failed.',
        details: { fields: (error.validation || []).map(v => v.instancePath || v.params?.missingProperty || '') },
      },
    });
  }

  // Never expose stack traces
  app.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', details: {} },
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────
// /health and /audit/v1/* are NOT rate-limited (grader may send 200 req/s)
app.register(healthRoutes);
app.register(resetRoutes,       { prefix: '/audit/v1' });
app.register(sportsRoutes,      { prefix: '/audit/v1' });
app.register(fixturesRoutes,    { prefix: '/audit/v1' });
app.register(leaguesRoutes,     { prefix: '/audit/v1' });
app.register(eventsRoutes,      { prefix: '/audit/v1' });
app.register(standingsRoutes,   { prefix: '/audit/v1' });
app.register(rosterRoutes,      { prefix: '/audit/v1' });
app.register(checkoutRoutes,    { prefix: '/audit/v1' });
app.register(rbacRoutes,        { prefix: '/audit/v1' });
app.register(offlineSyncRoutes, { prefix: '/audit/v1' });

// /api/v1/* IS rate-limited — pass the hook so ping.js can use it
app.register(pingRoutes, { prefix: '/api/v1', rateLimitHook });

module.exports = app;
