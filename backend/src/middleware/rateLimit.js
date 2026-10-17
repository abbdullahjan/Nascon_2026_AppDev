'use strict';

const redis = require('../config/redis');

const WINDOW_MS  = 10_000; // 10 seconds
const MAX_REQ    = 100;    // per IP per window

/**
 * Rate limiter for /api/v1/* routes only.
 * /audit/v1/* and /health are explicitly exempt.
 *
 * Returns a Fastify hook function (preHandler).
 * Sends 429 RATE_LIMITED with Retry-After header when exceeded.
 */
function rateLimitHook() {
  return async function (request, reply) {
    const ip  = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const key = `rate:${ip}`;

    const current = await redis.incr(key);
    if (current === 1) {
      // First request in this window — set expiry
      await redis.pexpire(key, WINDOW_MS);
    }

    if (current > MAX_REQ) {
      const ttl = await redis.pttl(key);
      const retryAfter = Math.ceil(ttl / 1000);
      reply.header('Retry-After', String(retryAfter));
      return reply.status(429).send({
        error: {
          code:    'RATE_LIMITED',
          message: `Rate limit exceeded. Maximum ${MAX_REQ} requests per 10 seconds.`,
          details: { retry_after_seconds: retryAfter },
        },
      });
    }
  };
}

module.exports = { rateLimitHook };
