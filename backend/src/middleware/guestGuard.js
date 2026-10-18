'use strict';

/**
 * Guest Write Guard — spec FR-4.3, Section 5.7
 *
 * Any request bearing an Authorization: Bearer guest_anon_tok_* header
 * on a state-mutating endpoint must be rejected with:
 *   HTTP 403  { error: { code: "GUEST_WRITE_FORBIDDEN", ... } }
 *
 * Per spec: "Client-side UI hiding alone receives zero credit."
 * This guard runs server-side as a Fastify preHandler hook.
 *
 * Protected routes (spec 5.7 Direct Write Enforcement Check):
 *   POST /api/v1/chat
 *   POST /audit/v1/checkout
 *   POST /audit/v1/events
 *
 * Additional routes that must honour the same guard:
 *   Any endpoint whose module explicitly calls requireNonGuest().
 *
 * Usage — as a preHandler in a route:
 *   fastify.post('/chat', { preHandler: [guestWriteGuard] }, handler)
 *
 * Usage — as a global hook on specific paths (registered in app.js):
 *   app.addHook('preHandler', guestWriteGuardForPaths([...]))
 */

const GUEST_PREFIX = 'guest_anon_tok_';

/**
 * Extract the raw token string from the Authorization header.
 * Returns null if the header is absent or not a Bearer token.
 */
function extractToken(request) {
  const header = request.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

/**
 * Returns true if the token is an anonymous guest token.
 */
function isGuestToken(token) {
  return typeof token === 'string' && token.startsWith(GUEST_PREFIX);
}

/**
 * Fastify preHandler — rejects guest tokens on write endpoints.
 * Attach directly to individual routes or use guestWriteGuardForPaths().
 */
async function guestWriteGuard(request, reply) {
  const token = extractToken(request);
  if (token && isGuestToken(token)) {
    return reply.status(403).send({
      error: {
        code:    'GUEST_WRITE_FORBIDDEN',
        message: 'Anonymous guest tokens cannot perform write mutations.',
        details: { guest_token: token },
      },
    });
  }
  // Non-guest or unauthenticated — let downstream auth middleware decide
}

/**
 * Returns a Fastify preHandler hook that enforces the guest write guard
 * only on the given URL path prefixes (exact method + path pairs).
 *
 * @param {Array<{method: string, path: string}>} rules
 *   e.g. [{ method: 'POST', path: '/api/v1/chat' }, ...]
 */
function guestWriteGuardForPaths(rules) {
  return async function (request, reply) {
    const method = request.method.toUpperCase();
    const url    = request.url.split('?')[0]; // strip query string

    const matched = rules.some(r =>
      r.method.toUpperCase() === method && url === r.path
    );

    if (matched) {
      await guestWriteGuard(request, reply);
    }
  };
}

/**
 * Spec-mandated protected write paths (Section 5.7).
 * The global hook in app.js uses this list.
 */
const PROTECTED_WRITE_PATHS = [
  { method: 'POST', path: '/api/v1/chat' },
  { method: 'POST', path: '/audit/v1/checkout' },
  { method: 'POST', path: '/audit/v1/events' },
];

module.exports = { guestWriteGuard, guestWriteGuardForPaths, PROTECTED_WRITE_PATHS, isGuestToken, extractToken };
