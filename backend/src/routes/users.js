'use strict';

const db            = require('../config/db');
const { sendError } = require('../utils/errors');

/**
 * /api/v1/users routes
 * User directory for Super-Admin management and RBAC verification.
 */
async function usersRoutes(fastify) {
  // GET /api/v1/users — list users (passwords never exposed)
  fastify.get('/users', async (request, reply) => {
    const { role, tenant_id } = request.query || {};

    let query = db('users').select('user_id', 'email', 'role', 'tenant_id', 'owned_id', 'created_at');
    if (role)      query = query.where({ role });
    if (tenant_id) query = query.where({ tenant_id });

    const users = await query.orderBy('created_at', 'asc');
    return reply.status(200).send({ users });
  });

  // GET /api/v1/users/:user_id — single user record
  fastify.get('/users/:user_id', async (request, reply) => {
    const { user_id } = request.params;

    const user = await db('users')
      .where({ user_id })
      .select('user_id', 'email', 'role', 'tenant_id', 'owned_id', 'created_at')
      .first();

    if (!user) {
      return sendError(reply, 404, 'USER_NOT_FOUND', `User '${user_id}' not found.`, {});
    }

    return reply.status(200).send({ user });
  });
}

module.exports = usersRoutes;
