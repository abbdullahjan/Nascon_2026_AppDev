'use strict';

const { throwValidation } = require('./errors');

/**
 * Lightweight manual validator for Phase II audit endpoints.
 *
 * Usage:
 *   const v = new Validator(body);
 *   v.require('action',     'string');
 *   v.require('player_id',  'string');
 *   v.optional('label',     'string');
 *   v.throw(); // throws 400 VALIDATION_ERROR if any field failed
 *
 * Rules:
 *   - Missing required field → added to failedFields
 *   - Wrong type             → added to failedFields
 *   - Extra fields are silently ignored
 *   - Validation order in callers must be: schema(400) → existence(404) → permission(403) → conflict(409)
 */
class Validator {
  constructor(obj) {
    this._obj    = obj || {};
    this._failed = [];
  }

  /**
   * Assert a required field exists and matches the expected type.
   * @param {string} field
   * @param {'string'|'number'|'boolean'|'array'|'object'} type
   * @param {object} [opts]
   * @param {string[]} [opts.enum]      - allowed string values
   * @param {number}   [opts.minLen]    - minimum string length
   * @param {number}   [opts.maxLen]    - maximum string length
   * @param {number}   [opts.min]       - minimum numeric value
   * @param {number}   [opts.minItems]  - minimum array length
   * @param {number}   [opts.maxItems]  - maximum array length
   */
  require(field, type, opts = {}) {
    const val = this._obj[field];
    if (val === undefined || val === null) {
      this._failed.push(field);
      return this;
    }
    if (!this._checkType(val, type)) {
      this._failed.push(field);
      return this;
    }
    this._applyOpts(field, val, type, opts);
    return this;
  }

  /**
   * Assert an optional field, only validate if present.
   */
  optional(field, type, opts = {}) {
    const val = this._obj[field];
    if (val === undefined || val === null) return this;
    if (!this._checkType(val, type)) {
      this._failed.push(field);
      return this;
    }
    this._applyOpts(field, val, type, opts);
    return this;
  }

  _checkType(val, type) {
    if (type === 'array')  return Array.isArray(val);
    if (type === 'object') return typeof val === 'object' && !Array.isArray(val);
    return typeof val === type;
  }

  _applyOpts(field, val, type, opts) {
    if (type === 'string') {
      if (opts.enum && !opts.enum.includes(val))              this._failed.push(field);
      if (opts.minLen !== undefined && val.length < opts.minLen) this._failed.push(field);
      if (opts.maxLen !== undefined && val.length > opts.maxLen) this._failed.push(field);
    }
    if (type === 'number') {
      if (opts.min !== undefined && val < opts.min) this._failed.push(field);
    }
    if (type === 'array') {
      if (opts.minItems !== undefined && val.length < opts.minItems) this._failed.push(field);
      if (opts.maxItems !== undefined && val.length > opts.maxItems) this._failed.push(field);
    }
  }

  /** Throw 400 VALIDATION_ERROR if any field failed. */
  throw(msg) {
    if (this._failed.length > 0) {
      throwValidation([...new Set(this._failed)], msg);
    }
  }

  /** True if any field has already failed (useful for early returns). */
  get hasErrors() {
    return this._failed.length > 0;
  }
}

module.exports = { Validator };
