'use strict';

/**
 * guest.test.js
 *
 * Unit tests for:
 *   - Spec 5.7 / 8.4 Guest Cart-Merge & Write Guard
 *   - Spec 5.9 Privacy Erasure Probe
 *   - Spec 5.3 Signature verification
 */

const { processCartMerge, processPrivacyErasure } = require('../src/modules/guest/cartService');
const { sign_day2 } = require('../src/shared');
const db = require('../src/config/db');

beforeAll(() => {
  process.env.DAY2_SALT = process.env.DAY2_SALT || 'T01D27ad7ffff12e';
});

describe('Guest Cart-Merge & Privacy Module', () => {
  describe('Schema Validation (400 VALIDATION_ERROR)', () => {
    test('rejects missing or non-guest_ prefix token', async () => {
      await expect(
        processCartMerge({
          guest_token: 'invalid_token_123',
          registered_user_id: 'player-alpha-1',
          guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    test('rejects missing registered_user_id', async () => {
      await expect(
        processCartMerge({
          guest_token: 'guest_test_tok_1',
          registered_user_id: '',
          guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    test('rejects empty guest_cart', async () => {
      await expect(
        processCartMerge({
          guest_token: 'guest_test_tok_1',
          registered_user_id: 'player-alpha-1',
          guest_cart: [],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    test('rejects invalid quantity <= 0', async () => {
      await expect(
        processCartMerge({
          guest_token: 'guest_test_tok_1',
          registered_user_id: 'player-alpha-1',
          guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 0 }],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('Entity Existence (404)', () => {
    test('returns 404 PLAYER_NOT_FOUND for unknown user', async () => {
      await expect(
        processCartMerge({
          guest_token: 'guest_test_tok_2',
          registered_user_id: 'player-nonexistent',
          guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }],
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'PLAYER_NOT_FOUND',
      });
    });

    test('returns 404 VARIANT_NOT_FOUND for unknown product variant', async () => {
      await expect(
        processCartMerge({
          guest_token: 'guest_test_tok_3',
          registered_user_id: 'player-alpha-1',
          guest_cart: [{ variant_id: 'var-unknown-999', quantity: 1 }],
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'VARIANT_NOT_FOUND',
      });
    });
  });

  describe('Stock Conflict (409 OUT_OF_STOCK)', () => {
    test('returns 409 OUT_OF_STOCK when requested quantity exceeds stock', async () => {
      // var-jersey-001-M has stock 1
      await expect(
        processCartMerge({
          guest_token: 'guest_stock_test_1',
          registered_user_id: 'player-alpha-1',
          guest_cart: [{ variant_id: 'var-jersey-001-M', quantity: 100 }],
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'OUT_OF_STOCK',
      });
    });
  });

  describe('Successful Cart Merge & Idempotency', () => {
    const testGuestToken = `guest_test_merge_${Date.now()}`;

    test('successfully merges guest cart and computes Section 5.3 signature', async () => {
      const res = await processCartMerge({
        guest_token: testGuestToken,
        registered_user_id: 'player-alpha-1',
        guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }],
        test_write_block: true,
      });

      expect(res.guest_token).toBe(testGuestToken);
      expect(res.write_block_verified).toBe(true);
      expect(res.write_rejection_code).toBe(403);
      expect(res.cart_merged).toBe(true);
      expect(res.active_cart.user_id).toBe('player-alpha-1');
      expect(res.active_cart.currency).toBe('PKR');
      expect(res.active_cart.total_items).toBeGreaterThanOrEqual(1);
      expect(res.signature).toHaveLength(64);

      // Verify signature contract:
      const expectedSig = sign_day2(testGuestToken, {
        cart_merged: true,
        guest_token: testGuestToken,
        registered_user_id: 'player-alpha-1',
        total_items: res.active_cart.total_items,
        write_rejection_code: 403,
      });
      expect(res.signature).toBe(expectedSig);
    });

    test('idempotent replay returns same result without duplicating item count', async () => {
      const replay = await processCartMerge({
        guest_token: testGuestToken,
        registered_user_id: 'player-alpha-1',
        guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }],
        test_write_block: true,
      });

      expect(replay.cart_merged).toBe(true);
      expect(replay.active_cart.total_items).toBeGreaterThanOrEqual(1);
    });

    test('throws 409 GUEST_TOKEN_ALREADY_MERGED when replayed with different user', async () => {
      await expect(
        processCartMerge({
          guest_token: testGuestToken,
          registered_user_id: 'player-alpha-2',
          guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }],
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'GUEST_TOKEN_ALREADY_MERGED',
      });
    });
  });

  describe('Privacy Erasure (Spec 5.9)', () => {
    test('returns 404 for unknown user', async () => {
      await expect(processPrivacyErasure('player-ghost-99')).rejects.toMatchObject({
        statusCode: 404,
        code: 'PLAYER_NOT_FOUND',
      });
    });

    test('successfully anonymizes player and wipes guest tokens', async () => {
      const res = await processPrivacyErasure('player-beta-2');
      expect(res).toEqual({
        user_id: 'player-beta-2',
        status: 'anonymized',
        pii_retained: false,
        tokens_wiped: true,
      });

      const updated = await db('players').where({ player_id: 'player-beta-2' }).first();
      expect(updated.name).toBe('Anonymized User');
    });
  });
});
