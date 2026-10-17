'use strict';

const jwt          = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { sendError }  = require('../utils/errors');

/**
 * Verify JWT from Authorization: Bearer <token> header.
 * Rejects: missing token, alg:none, tampered signature, expired.
 * Returns decoded payload on success, or sends 401 and returns null.
 */
async function verifyJWT(request, reply) {
  const authHeader = request.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(reply, 401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header.', {});
    return null;
  }

  const token = authHeader.slice(7).trim();

  try {
    // Force HS256 — reject alg:none and any other algorithm
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return {
      role:     decoded.role,
      tenantId: decoded.tenant_id || null,
      ownedId:  decoded.owned_id  || null,
      userId:   decoded.user_id   || null,
    };
  } catch (err) {
    sendError(reply, 401, 'UNAUTHENTICATED', 'Token is invalid, expired, or uses a forbidden algorithm.', {});
    return null;
  }
}

module.exports = { verifyJWT };
