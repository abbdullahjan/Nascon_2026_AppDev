'use strict';

const crypto = require('crypto');

/**
 * Canonical JSON serialization — Section 5.3
 * Recursively sorts object keys by Unicode code point.
 * No whitespace, non-ASCII not escaped, integers without decimal.
 */
function canonical(obj) {
  if (obj === null)             return 'null';
  if (typeof obj === 'boolean') return String(obj);
  if (typeof obj === 'number')  return String(obj);
  if (typeof obj === 'string')  return JSON.stringify(obj);
  if (Array.isArray(obj))       return '[' + obj.map(canonical).join(',') + ']';
  if (typeof obj === 'object') {
    const keys   = Object.keys(obj).sort();
    const pairs  = keys.map(k => JSON.stringify(k) + ':' + canonical(obj[k]));
    return '{' + pairs.join(',') + '}';
  }
  return JSON.stringify(obj);
}

/**
 * Compute HMAC-SHA256 signature per Section 5.3.
 * Key  = DAY1_SALT (UTF-8 bytes, not hex-decoded, not trimmed)
 * Msg  = id + "|" + canonical(payloadObj)  (UTF-8)
 * Out  = lowercase hex, 64 chars
 */
function sign(id, payloadObj) {
  const salt = process.env.DAY1_SALT;
  if (!salt) throw new Error('DAY1_SALT environment variable is not set.');

  const message = id + '|' + canonical(payloadObj);
  return crypto
    .createHmac('sha256', Buffer.from(salt, 'utf8'))
    .update(Buffer.from(message, 'utf8'))
    .digest('hex');
}

module.exports = { sign, canonical };
