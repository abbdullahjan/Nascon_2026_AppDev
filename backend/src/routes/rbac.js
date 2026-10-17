'use strict';

const rbacService   = require('../services/rbacService');
const { verifyJWT } = require('../middleware/auth');
const { sendError } = require('../utils/errors');

// POST /audit/v1/rbac-matrix         — return JWTs for all 5 roles (no auth)
// Probe routes P1–P7                 — authorization-only checks
async function rbacRoutes(fastify) {

  // Return 5-role JWT matrix + context ids
  fastify.post('/rbac-matrix', async (request, reply) => {
    const result = await rbacService.getMatrix();
    return reply.status(200).send(result);
  });

  // Helper: run an auth probe — allowed → 200, denied → 403, no token → 401
  const probe = (allowedRoles, scopeCheck) => async (request, reply) => {
    const authResult = await verifyJWT(request, reply);
    if (!authResult) return; // verifyJWT already replied with 401
    const { role, tenantId, ownedId } = authResult;

    const allowed = rbacService.checkProbe(role, tenantId, ownedId, allowedRoles, scopeCheck, request.params);
    if (allowed) {
      return reply.status(200).send({ authorized: true });
    }
    return sendError(reply, 403, 'FORBIDDEN', 'You do not have permission to perform this action.', {});
  };

  // P1 — POST /audit/v1/rbac/tenants
  fastify.post('/rbac/tenants', probe(['super_admin'], null));

  // P2 — POST /audit/v1/rbac/leagues/:league_id/fixtures
  fastify.post('/rbac/leagues/:league_id/fixtures', probe(['super_admin', 'league_organizer'], 'own_league'));

  // P3 — POST /audit/v1/rbac/clubs/:club_id/roster
  fastify.post('/rbac/clubs/:club_id/roster', probe(['super_admin', 'club_manager'], 'own_club'));

  // P4 — POST /audit/v1/rbac/clubs/:club_id/products
  fastify.post('/rbac/clubs/:club_id/products', probe(['super_admin', 'club_manager'], 'own_club'));

  // P5 — PATCH /audit/v1/rbac/players/:player_id
  fastify.patch('/rbac/players/:player_id', probe(['super_admin', 'club_manager', 'player'], 'own_player'));

  // P6 — GET /audit/v1/rbac/clubs/:club_id  (all roles in same tenant, super_admin cross-tenant)
  fastify.get('/rbac/clubs/:club_id', probe(['super_admin', 'league_organizer', 'club_manager', 'player', 'viewer'], 'same_tenant_club'));

  // P7 — GET /audit/v1/rbac/platform/config
  fastify.get('/rbac/platform/config', probe(['super_admin'], null));
}

module.exports = rbacRoutes;
