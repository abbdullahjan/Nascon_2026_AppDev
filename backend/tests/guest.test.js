'use strict';

/**
 * guest.test.js
 *
 * Unit tests for:
 *   - Spec 5.7 / 8.4 Guest Cart-Merge & Write Guard
 *   - Spec 5.9 Privacy Erasure Probe
 *   - Spec 5.3 Signature verification
 *
 * Fully mocked DB for offline deterministic execution.
 */

process.env.DAY2_SALT = process.env.DAY2_SALT || 'T01D27ad7ffff12e';

const mockPlayers = {
  'player-alpha-1': { player_id: 'player-alpha-1', name: 'Player Alpha 1' },
  'player-alpha-2': { player_id: 'player-alpha-2', name: 'Player Alpha 2' },
  'player-beta-2':  { player_id: 'player-beta-2',  name: 'Player Beta 2'  },
};

const mockVariants = {
  'var-jersey-001-M': { variant_id: 'var-jersey-001-M', stock: 1, price_minor: 450000 },
  'var-jersey-001-L': { variant_id: 'var-jersey-001-L', stock: 5, price_minor: 450000 },
};

const mockGuestTokens = {
  'guest_anon_tok_7721': {
    token: 'guest_anon_tok_7721',
    merged: false,
    merged_into_user_id: null,
    merged_payload_hash: null,
  },
};

const mockPersistentCarts = []; // { user_id, variant_id, quantity }

jest.mock('../src/config/db', () => {
  const players = mockPlayers;
  const variants = mockVariants;
  const guestTokens = mockGuestTokens;
  const carts = mockPersistentCarts;

  const builder = (table) => {
    const b = {
      _table: table,
      _wheres: {},
      _whereIns: {},
      where(q) {
        if (typeof q === 'object') Object.assign(this._wheres, q);
        return this;
      },
      orWhere(q) {
        return this;
      },
      whereIn(col, arr) {
        this._whereIns[col] = arr;
        return this;
      },
      forUpdate() {
        return this;
      },
      orderBy() {
        return this;
      },
      select() {
        return this;
      },
      join() {
        return this;
      },
      async first() {
        if (this._table === 'players') {
          return players[this._wheres.player_id] || null;
        }
        if (this._table === 'guest_tokens') {
          return guestTokens[this._wheres.token] || null;
        }
        return null;
      },
      then(resolve) {
        if (this._table === 'product_variants') {
          const list = (this._whereIns.variant_id || []).map((id) => variants[id]).filter(Boolean);
          return Promise.resolve(list).then(resolve);
        }
        if (this._table === 'persistent_carts') {
          const userId = this._wheres['persistent_carts.user_id'] || this._wheres.user_id;
          const userCarts = carts.filter((c) => c.user_id === userId).map((c) => {
            const v = variants[c.variant_id] || { price_minor: 450000 };
            return {
              variant_id: c.variant_id,
              quantity: c.quantity,
              price_minor: v.price_minor,
            };
          });
          return Promise.resolve(userCarts).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      },
      async insert(rows) {
        const arr = Array.isArray(rows) ? rows : [rows];
        for (const row of arr) {
          if (this._table === 'guest_tokens') {
            guestTokens[row.token] = { ...row };
          }
          if (this._table === 'persistent_carts') {
            carts.push({ ...row });
          }
        }
      },
      async update(up) {
        if (this._table === 'players' && this._wheres.player_id) {
          if (players[this._wheres.player_id]) {
            Object.assign(players[this._wheres.player_id], up);
          }
        }
        if (this._table === 'guest_tokens') {
          const t = this._wheres.token;
          if (t && guestTokens[t]) {
            Object.assign(guestTokens[t], up);
          }
        }
        if (this._table === 'persistent_carts') {
          const item = carts.find(
            (c) => c.user_id === this._wheres.user_id && c.variant_id === this._wheres.variant_id
          );
          if (item) Object.assign(item, up);
        }
      },
      async truncate() {
        carts.length = 0;
      },
    };
    return b;
  };

  builder.transaction = async (fn) => fn(builder);
  return builder;
});

const { processCartMerge, processPrivacyErasure } = require('../src/modules/guest/cartService');
const { sign_day2 } = require('../src/shared');

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
        httpStatus: 400,
        errorCode: 'VALIDATION_ERROR',
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
        httpStatus: 400,
        errorCode: 'VALIDATION_ERROR',
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
        httpStatus: 400,
        errorCode: 'VALIDATION_ERROR',
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
        httpStatus: 400,
        errorCode: 'VALIDATION_ERROR',
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
        httpStatus: 404,
        errorCode: 'PLAYER_NOT_FOUND',
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
        httpStatus: 404,
        errorCode: 'VARIANT_NOT_FOUND',
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
        httpStatus: 409,
        errorCode: 'OUT_OF_STOCK',
      });
    });
  });

  describe('Successful Cart Merge & Idempotency', () => {
    const testGuestToken = 'guest_test_merge_101';

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
      expect(res.active_cart.total_items).toBe(1);
      expect(res.signature).toHaveLength(64);

      // Verify signature contract:
      const expectedSig = sign_day2(testGuestToken, {
        cart_merged: true,
        guest_token: testGuestToken,
        registered_user_id: 'player-alpha-1',
        total_items: 1,
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
      expect(replay.active_cart.total_items).toBe(1);
    });

    test('throws 409 GUEST_TOKEN_ALREADY_MERGED when replayed with different user', async () => {
      await expect(
        processCartMerge({
          guest_token: testGuestToken,
          registered_user_id: 'player-alpha-2',
          guest_cart: [{ variant_id: 'var-jersey-001-L', quantity: 1 }],
        })
      ).rejects.toMatchObject({
        httpStatus: 409,
        errorCode: 'GUEST_TOKEN_ALREADY_MERGED',
      });
    });
  });

  describe('Privacy Erasure (Spec 5.9)', () => {
    test('returns 404 for unknown user', async () => {
      await expect(processPrivacyErasure('player-ghost-99')).rejects.toMatchObject({
        httpStatus: 404,
        errorCode: 'PLAYER_NOT_FOUND',
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
    });
  });
});
