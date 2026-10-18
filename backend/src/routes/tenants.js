'use strict';

const db            = require('../config/db');
const { sendError } = require('../utils/errors');

/**
 * /api/v1/tenants routes
 * Multi-tenant organization directory for Super-Admin and tenant selection.
 */
async function tenantsRoutes(fastify) {
  // GET /api/v1/tenants — list all organizations
  fastify.get('/tenants', async (request, reply) => {
    const tenants = await db('tenants').select('*').orderBy('created_at', 'asc');
    return reply.status(200).send({ tenants });
  });

  // GET /api/v1/tenants/:tenant_id — single tenant overview with counts
  fastify.get('/tenants/:tenant_id', async (request, reply) => {
    const { tenant_id } = request.params;

    const tenant = await db('tenants').where({ tenant_id }).first();
    if (!tenant) {
      return sendError(reply, 404, 'TENANT_NOT_FOUND', `Tenant '${tenant_id}' not found.`, {});
    }

    const clubsCount = await db('clubs').where({ tenant_id }).count('club_id as cnt').first();
    const leaguesCount = await db('leagues').where({ tenant_id }).count('league_id as cnt').first();
    const productsCount = await db('products').where({ tenant_id }).count('product_id as cnt').first();

    return reply.status(200).send({
      tenant: {
        tenant_id:      tenant.tenant_id,
        name:           tenant.name,
        clubs_count:    parseInt(clubsCount?.cnt || 0, 10),
        leagues_count:  parseInt(leaguesCount?.cnt || 0, 10),
        products_count: parseInt(productsCount?.cnt || 0, 10),
        created_at:     tenant.created_at,
      },
    });
  });
}

module.exports = tenantsRoutes;
