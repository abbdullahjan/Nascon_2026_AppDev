'use strict';

const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const db         = require('../config/db');
const { sendError } = require('../utils/errors');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

// POST /api/v1/login
// Authenticates a user and returns a JWT.
// Used by the mobile app for all 5 demo roles.
async function authRoutes(fastify) {
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body || {};

    if (!email || !password) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'email and password are required.', { fields: ['email', 'password'] });
    }

    const user = await db('users').where({ email }).first();
    if (!user) {
      return sendError(reply, 401, 'UNAUTHENTICATED', 'Invalid email or password.', {});
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return sendError(reply, 401, 'UNAUTHENTICATED', 'Invalid email or password.', {});
    }

    const token = jwt.sign(
      {
        user_id:   user.user_id,
        email:     user.email,
        role:      user.role,
        tenant_id: user.tenant_id,
        owned_id:  user.owned_id,
      },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN }
    );

    return reply.status(200).send({
      token,
      user: {
        user_id:   user.user_id,
        email:     user.email,
        role:      user.role,
        tenant_id: user.tenant_id,
      },
    });
  });
}

module.exports = authRoutes;
