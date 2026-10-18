'use strict';

/**
 * moderation/service.js
 *
 * Implements:
 *   - FR-5.3 Synchronous profanity/leetspeak masking and character flood detection.
 *   - FR-5.2 Dead-Letter Queue (DLQ) inspection and simulation.
 *   - Section 5.3 Deterministic signature computation.
 */

const db = require('../../config/db');
const { sign_day2 } = require('../../shared');
const { setMetric } = require('../realtime/store');

const BAD_WORDS = new Set([
  'badword',
  'porn',
  'scam',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'idiotspam',
  'idiot_spam',
]);

/**
 * Normalize leetspeak substitutions according to spec 5.8:
 *   @ → a, 0 → o, 1/! → i, 3 → e, $ → s, _/./-/* → stripped
 */
function normalize(str) {
  return str
    .replace(/@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/[1!]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/\$/g, 's')
    .replace(/[_.\-*]/g, '')
    .toLowerCase();
}

/**
 * Character Repeat / Flood Rejection (Spec 5.8):
 * Any message containing >= 4 consecutive identical characters (case-insensitive)
 * OR >= 3 consecutive exclamation/question marks (!!! or ???).
 */
function isFlooded(text) {
  if (!text || typeof text !== 'string') return false;
  if (/(.)\1{3,}/i.test(text)) return true;
  if (/[!?]{3,}/.test(text)) return true;
  return false;
}

/**
 * Check and mask profanity/leetspeak in text.
 * Replaces matching tokens with '***'.
 */
function maskProfanity(text) {
  if (!text || typeof text !== 'string') {
    return { maskedText: text, flagged: false };
  }

  let flagged = false;
  const tokens = text.split(/(\s+)/);

  const maskedTokens = tokens.map((token) => {
    if (/^\s+$/.test(token)) return token;

    let lead = '';
    let core = token;
    let trail = '';

    const leadMatch = core.match(/^([^a-zA-Z0-9@$301!]+)(.*)$/);
    if (leadMatch) {
      lead = leadMatch[1];
      core = leadMatch[2];
    }

    const trailMatch = core.match(/^(.*?)([!,?.:;"')\]]+)$/);
    if (trailMatch && trailMatch[1].length > 0) {
      core = trailMatch[1];
      trail = trailMatch[2];
    }

    if (BAD_WORDS.has(normalize(core))) {
      flagged = true;
      return lead + '***' + trail;
    } else if (BAD_WORDS.has(normalize(token))) {
      flagged = true;
      return '***';
    }

    return token;
  });

  return {
    maskedText: maskedTokens.join(''),
    flagged,
  };
}

/**
 * Moderate a single message.
 * Exported for internal callers (e.g. realtime broadcaster).
 */
function moderateMessage({ chat_room_id, message_id, sender, text }) {
  if (isFlooded(text)) {
    return {
      dropped: true,
      muted: true,
      kicked: false,
      text: null,
      flagged: true,
      reason: 'flood_detected',
    };
  }

  const { maskedText, flagged } = maskProfanity(text);
  return {
    dropped: false,
    muted: false,
    kicked: flagged,
    text: maskedText,
    flagged,
    reason: flagged ? 'profanity_leetspeak' : null,
  };
}

/**
 * Process a batch of messages for POST /audit/v1/moderation/test.
 */
async function processModerationTest({
  chat_room_id,
  incoming_messages = [],
  check_dlq = true,
  simulate_failed_notifications = 0,
}) {
  const filtered_messages = [];
  const kicked_users = [];
  const muted_users = [];

  for (const msg of incoming_messages) {
    const { message_id, sender, text } = msg;

    if (isFlooded(text)) {
      if (!muted_users.includes(sender)) {
        muted_users.push(sender);
      }
      // Dropped completely from filtered_messages
      continue;
    }

    const { maskedText, flagged } = maskProfanity(text);

    if (flagged) {
      if (!kicked_users.includes(sender)) {
        kicked_users.push(sender);
      }
      filtered_messages.push({
        message_id,
        sender,
        text: maskedText,
        flagged: true,
        reason: 'profanity_leetspeak',
      });
    } else {
      filtered_messages.push({
        message_id,
        sender,
        text,
        flagged: false,
        reason: null,
      });
    }
  }

  // Handle simulated failed notifications
  const simCount = Number(simulate_failed_notifications) || 0;
  if (simCount > 0) {
    const rows = [];
    for (let i = 0; i < simCount; i++) {
      rows.push({
        chat_room_id,
        event_payload: JSON.stringify({
          notification_id: `notif-fail-${Date.now()}-${i}`,
          reason: 'simulated_failure',
          timestamp: new Date().toISOString(),
        }),
        attempt_count: 3,
        status: 'failed',
      });
    }
    await db('moderation_dlq').insert(rows);
  }

  // Retrieve DLQ status
  let queue_depth = 0;
  let undelivered_events = [];

  try {
    const dlqRows = await db('moderation_dlq')
      .where({ chat_room_id })
      .orderBy('id', 'asc');

    queue_depth = dlqRows.length;
    undelivered_events = dlqRows.map((r) => {
      if (typeof r.event_payload === 'string') {
        try {
          return JSON.parse(r.event_payload);
        } catch {
          return r.event_payload;
        }
      }
      return r.event_payload;
    });

    // Update Prometheus metric for total DLQ depth across all rooms
    const totalRow = await db('moderation_dlq').count('id as count').first();
    const totalDepth = totalRow ? parseInt(totalRow.count, 10) : 0;
    setMetric('nascon_dlq_depth', totalDepth);
  } catch {
    // If DB is offline during unit testing
  }

  const flagged_count = filtered_messages.filter((m) => m.flagged).length;

  // Build sig_payload according to Section 5.3:
  // {"chat_room_id": <chat_room_id>, "flagged_count": <int>, "kicked_users": <kicked_users>, "queue_depth": <int>}
  const sig_payload = {
    chat_room_id,
    flagged_count,
    kicked_users,
    queue_depth,
  };

  const signature = sign_day2(chat_room_id, sig_payload);

  return {
    chat_room_id,
    filtered_messages,
    kicked_users,
    muted_users,
    dlq_status: {
      queue_depth,
      undelivered_events,
    },
    signature,
  };
}

module.exports = {
  normalize,
  isFlooded,
  maskProfanity,
  moderateMessage,
  processModerationTest,
};
