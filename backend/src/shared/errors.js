'use strict';

/**
 * Shared error helpers for Phase II modules.
 *
 * Re-exports the existing AppError / sendError from src/utils/errors.js so
 * Phase II modules only need to import from one place.  We deliberately do
 * NOT redefine these classes — single source of truth.
 */
const { AppError, sendError } = require('../utils/errors');

/**
 * Throw a 400 VALIDATION_ERROR with a details.fields array.
 *
 * Spec rule: validation order — 400 VALIDATION_ERROR is always checked first.
 *
 * @param {string[]} fields - list of offending field names
 * @param {string}   [msg]  - optional override message
 */
function throwValidation(fields, msg) {
  throw new AppError(
    400,
    'VALIDATION_ERROR',
    msg || 'Request validation failed.',
    { fields: fields || [] }
  );
}

/**
 * Throw a 404 *_NOT_FOUND error.
 *
 * @param {string} code    - e.g. 'PLAYER_NOT_FOUND'
 * @param {string} message
 * @param {object} [details]
 */
function throwNotFound(code, message, details = {}) {
  throw new AppError(404, code, message, details);
}

/**
 * Throw a 409 conflict error.
 *
 * @param {string} code    - e.g. 'COSTREAM_SESSION_FULL'
 * @param {string} message
 * @param {object} [details]
 */
function throwConflict(code, message, details = {}) {
  throw new AppError(409, code, message, details);
}

/**
 * Throw a 403 forbidden error.
 *
 * @param {string} code    - e.g. 'GUEST_WRITE_FORBIDDEN'
 * @param {string} message
 * @param {object} [details]
 */
function throwForbidden(code, message, details = {}) {
  throw new AppError(403, code, message, details);
}

module.exports = { AppError, sendError, throwValidation, throwNotFound, throwConflict, throwForbidden };
