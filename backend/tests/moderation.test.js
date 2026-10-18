'use strict';

/**
 * moderation.test.js
 *
 * Unit tests for:
 *   - FR-5.3 Chat Moderation Engine (leetspeak, flood, masking)
 *   - FR-5.2 Notification DLQ
 *   - Spec Section 5.8 & 5.3 signature contract
 */

const {
  normalize,
  isFlooded,
  maskProfanity,
  moderateMessage,
  processModerationTest,
} = require('../src/modules/moderation/service');
const { sign_day2 } = require('../src/shared');

beforeAll(() => {
  process.env.DAY2_SALT = process.env.DAY2_SALT || 'T01D27ad7ffff12e';
});

describe('Moderation Engine — Pure Logic', () => {
  describe('normalize()', () => {
    test('substitutes @ → a', () => {
      expect(normalize('sc@m')).toBe('scam');
    });

    test('substitutes 0 → o', () => {
      expect(normalize('p0rn')).toBe('porn');
    });

    test('substitutes 1 and ! → i', () => {
      expect(normalize('sh!t')).toBe('shit');
      expect(normalize('b1tch')).toBe('bitch');
    });

    test('substitutes 3 → e', () => {
      expect(normalize('b@dw0rd')).toBe('badword');
    });

    test('substitutes $ → s', () => {
      expect(normalize('$cam')).toBe('scam');
    });

    test('strips _, ., -, *', () => {
      expect(normalize('b@d_w0rd')).toBe('badword');
      expect(normalize('b.a-d*w_o.r-d')).toBe('badword');
    });
  });

  describe('isFlooded()', () => {
    test('detects >= 4 consecutive identical characters', () => {
      expect(isFlooded('AAAA')).toBe(true);
      expect(isFlooded('aaaa')).toBe(true);
      expect(isFlooded('GOAL! AAAA!!!')).toBe(true);
      expect(isFlooded('hellooooo')).toBe(true);
      expect(isFlooded('AAA')).toBe(false);
      expect(isFlooded('Normal text')).toBe(false);
    });

    test('detects >= 3 consecutive exclamation or question marks', () => {
      expect(isFlooded('Watch this!!!')).toBe(true);
      expect(isFlooded('Really???')).toBe(true);
      expect(isFlooded('No!!')).toBe(false);
      expect(isFlooded('What?')).toBe(false);
    });
  });

  describe('maskProfanity()', () => {
    test('masks bad words with ***', () => {
      const res = maskProfanity('Watch this illegal stream b@d_w0rd now!');
      expect(res.flagged).toBe(true);
      expect(res.maskedText).toBe('Watch this illegal stream *** now!');
    });

    test('handles clean text without modification', () => {
      const res = maskProfanity('Clean sports commentary');
      expect(res.flagged).toBe(false);
      expect(res.maskedText).toBe('Clean sports commentary');
    });

    test('masks p0rn, sc@m, fuck, shit, bitch, asshole', () => {
      expect(maskProfanity('visit this p0rn site').maskedText).toBe('visit this *** site');
      expect(maskProfanity('this is a sc@m').maskedText).toBe('this is a ***');
      expect(maskProfanity('what the fuck').maskedText).toBe('what the ***');
      expect(maskProfanity('holy shit!').maskedText).toBe('holy ***!');
      expect(maskProfanity('you bitch').maskedText).toBe('you ***');
      expect(maskProfanity('what an asshole').maskedText).toBe('what an ***');
    });
  });

  describe('moderateMessage()', () => {
    test('returns dropped: true on flood', () => {
      const res = moderateMessage({
        chat_room_id: 'chat-1',
        message_id: 'm1',
        sender: 'flooder',
        text: 'GOAL! AAAA!!!',
      });
      expect(res.dropped).toBe(true);
      expect(res.muted).toBe(true);
      expect(res.kicked).toBe(false);
      expect(res.reason).toBe('flood_detected');
    });

    test('returns kicked: true on profanity', () => {
      const res = moderateMessage({
        chat_room_id: 'chat-1',
        message_id: 'm2',
        sender: 'spammer',
        text: 'check out this b@d_w0rd',
      });
      expect(res.dropped).toBe(false);
      expect(res.kicked).toBe(true);
      expect(res.text).toBe('check out this ***');
      expect(res.reason).toBe('profanity_leetspeak');
    });

    test('returns clean message unchanged', () => {
      const res = moderateMessage({
        chat_room_id: 'chat-1',
        message_id: 'm3',
        sender: 'user1',
        text: 'Great game today',
      });
      expect(res.dropped).toBe(false);
      expect(res.kicked).toBe(false);
      expect(res.muted).toBe(false);
      expect(res.text).toBe('Great game today');
    });
  });

  describe('processModerationTest() — Spec 5.8 Contract', () => {
    test('matches Spec 5.8 example request & response structure', async () => {
      const input = {
        chat_room_id: 'chat-cs-session-101',
        incoming_messages: [
          {
            message_id: 'msg-1',
            sender: 'user-guest-1',
            text: 'Clean sports commentary',
          },
          {
            message_id: 'msg-2',
            sender: 'user-spammer',
            text: 'Watch this illegal stream b@d_w0rd now!',
          },
          {
            message_id: 'msg-3',
            sender: 'user-flooder',
            text: 'GOAL! AAAA!!!',
          },
        ],
        check_dlq: true,
        simulate_failed_notifications: 0,
      };

      const result = await processModerationTest(input);

      expect(result.chat_room_id).toBe('chat-cs-session-101');
      expect(result.filtered_messages).toHaveLength(2);
      expect(result.filtered_messages[0]).toEqual({
        message_id: 'msg-1',
        sender: 'user-guest-1',
        text: 'Clean sports commentary',
        flagged: false,
        reason: null,
      });
      expect(result.filtered_messages[1]).toEqual({
        message_id: 'msg-2',
        sender: 'user-spammer',
        text: 'Watch this illegal stream *** now!',
        flagged: true,
        reason: 'profanity_leetspeak',
      });
      expect(result.kicked_users).toEqual(['user-spammer']);
      expect(result.muted_users).toEqual(['user-flooder']);
      expect(result.dlq_status.queue_depth).toBe(0);
      expect(typeof result.signature).toBe('string');
      expect(result.signature).toHaveLength(64);

      // Verify signature payload contract
      const expectedSig = sign_day2('chat-cs-session-101', {
        chat_room_id: 'chat-cs-session-101',
        flagged_count: 1,
        kicked_users: ['user-spammer'],
        queue_depth: 0,
      });
      expect(result.signature).toBe(expectedSig);
    });

    test('deduplicates kicked and muted users preserving first violation order', async () => {
      const input = {
        chat_room_id: 'chat-room-2',
        incoming_messages: [
          { message_id: 'm1', sender: 'spammer1', text: 'fuck this' },
          { message_id: 'm2', sender: 'spammer2', text: 'b@d_w0rd' },
          { message_id: 'm3', sender: 'spammer1', text: 'shit again' },
          { message_id: 'm4', sender: 'flooder1', text: 'AAAA' },
          { message_id: 'm5', sender: 'flooder1', text: 'BBBB' },
        ],
      };

      const result = await processModerationTest(input);
      expect(result.kicked_users).toEqual(['spammer1', 'spammer2']);
      expect(result.muted_users).toEqual(['flooder1']);
      expect(result.filtered_messages).toHaveLength(3);
    });
  });
});
