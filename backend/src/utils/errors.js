'use strict';

/**
 * Application error class — carries HTTP status, error code, and details.
 * All non-2xx responses use the standard body: { error: { code, message, details } }
 */
class AppError extends Error {
  constructor(httpStatus, errorCode, message, details = {}) {
    super(message);
    this.httpStatus = httpStatus;
    this.errorCode  = errorCode;
    this.details    = details;
  }
}

/**
 * Send a standardised error response.
 * Use this in route handlers and the global error hook.
 */
function sendError(reply, httpStatus, code, message, details = {}) {
  return reply.status(httpStatus).send({
    error: { code, message, details },
  });
}

/**
 * Fastify error hook — converts AppError and Fastify validation errors
 * into the standard error body format.
 */
function errorHandler(error, request, reply) {
  // Our own AppError
  if (error instanceof AppError) {
    return reply.status(error.httpStatus).send({
      error: { code: error.errorCode, message: error.message, details: error.details },
    });
  }

  // Fastify body-size limit
  if (error.statusCode === 413) {
    return reply.status(413).send({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1 MB.', details: {} },
    });
  }

  // Fastify JSON schema validation
  if (error.statusCode === 400 && error.validation) {
    return reply.status(400).send({
      error: {
        code:    'VALIDATION_ERROR',
        message: 'Schema validation failed.',
        details: { fields: (error.validation || []).map(v => v.instancePath || v.params?.missingProperty || '') },
      },
    });
  }

  // Fallback — never expose stack traces
  reply.status(error.statusCode || 500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', details: {} },
  });
}

module.exports = { AppError, sendError, errorHandler };
