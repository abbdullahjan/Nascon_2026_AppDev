'use strict';

const crypto    = require('crypto');
const { canonical } = require('./canonical');

/**
 * Compute HMAC-SHA256 signature for Phase II (DAY2_SALT).
 * Spec Section 5.3:
 *   key     = DAY2_SALT as UTF-8 bytes (never trimmed, never hex-decoded)
 *   message = entity_id + "|" + canonical(sig_payload)  (UTF-8)
 *   output  = 64 lowercase hex characters
 *
 * @param {string} entityId   - The entity_id for this record (e.g. "sk_live_9f83a1b2c3d4e5f6")
 * @param {object} sigPayload - The exact sig_payload object defined in Section 5.3 table
 * @returns {string} 64-char lowercase hex digest
 */
function sign_day2(entityId, sigPayload) {
  const salt = process.env.DAY2_SALT;
  if (!salt) throw new Error('DAY2_SALT environment variable is not set.');

  const message = entityId + '|' + canonical(sigPayload);
  return crypto
    .createHmac('sha256', Buffer.from(salt, 'utf8'))
    .update(Buffer.from(message, 'utf8'))
    .digest('hex');
}

module.exports = { sign_day2, canonical };
