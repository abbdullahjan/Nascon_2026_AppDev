'use strict';

/**
 * src/shared barrel export.
 * Import from here rather than individual files:
 *   const { canonical, sign_day2, Validator, throwValidation, config } = require('../shared');
 */
const { canonical }                                    = require('./canonical');
const { sign_day2 }                                    = require('./sign');
const { AppError, sendError,
        throwValidation, throwNotFound,
        throwConflict, throwForbidden }                = require('./errors');
const { Validator }                                    = require('./validate');
const config                                           = require('./config');

module.exports = {
  canonical,
  sign_day2,
  AppError,
  sendError,
  throwValidation,
  throwNotFound,
  throwConflict,
  throwForbidden,
  Validator,
  config,
};
