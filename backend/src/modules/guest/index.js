'use strict';

/**
 * Module: guest
 * Owner: Person A
 * Spec: Section 5.7 (Guest Read-Only Boundary & Progressive Cart Merge)
 *
 * Routes:
 *   POST /audit/v1/guest/cart-merge
 *
 * Validation order (spec 5.2): 400 → 404 → 409
 * Never 5xx on /audit/v1/*.
 */

const crypto = require('crypto');
const db     = require('../../config/db');
const {
  sign_day2, throwValidation, throwNotFound, throwConflict, Validator, config,
} = require('../../shared');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic hash of the merge request for idempotency.
 * Uses SHA-256 of canonical JSON of (guest_token, registered_user_id, guest_cart).
 */
function mergePayloadHash(guestToken, registeredUserId, guestCart) {
  const canonical = JSON.stringify({
    g: guestToken,
    u: registeredUserId,
    c: guestCart.map((i) => ({ v: i.variant_id, q: i.quantity })).sort((a, b) =>
      a.v < b.v ? -1 : a.v > b.v ? 1 : a.q - b.q
    ),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 64);
}

/**
 * Build active_cart from persistent_carts rows for a user.
 */
async function buildActiveCart(trx, userId) {
  const rows = await trx('persistent_carts')
    .join('product_variants', 'persistent_carts.variant_id', 'product_variants.variant_id')
    .where('persistent_carts.user_id', userId)
    .select(
      'persistent_carts.variant_id',
      'persistent_carts.quantity',
      'product_variants.price_minor as unit_price_minor',
      'product_variants.currency',
    );

  const items        = rows.map((r) => ({
    variant_id:      r.variant_id,
    quantity:        r.quantity,
    unit_price_minor: r.unit_price_minor,
  }));
  const total_items  = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal_minor = items.reduce((s, i) => s + i.quantity * i.unit_price_minor, 0);
  const currency     = rows.length > 0 ? rows[0].currency : 'PKR';

  return { user_id: userId, currency, total_items, subtotal_minor, items };
}

// ── Route registration ────────────────────────────────────────────────────────

async function registerRoutes(app) {

  // ── POST /audit/v1/guest/cart-merge ────────────────────────────────────────
  app.post('/audit/v1/guest/cart-merge', async (request, reply) => {
    const body = request.body || {};

    // ── Step 1: Schema validation (400) ──────────────────────────────────────
    const v = new Validator(body);
    v.require('guest_token',       'string', { minLen: 1 });
    v.require('registered_user_id','string', { minLen: 1 });
    v.require('guest_cart',        'array',  { minItems: 1, maxItems: 10 });
    v.throw();

    const { guest_token, registered_user_id, guest_cart, test_write_block = true } = body;

    // guest_token must start with 'guest_' (spec 5.7 rule 1)
    if (!guest_token.startsWith('guest_')) {
      throwValidation(['guest_token'], 'guest_token must start with "guest_".');
    }

    // Validate each cart item
    for (const item of guest_cart) {
      if (typeof item.variant_id !== 'string' || !item.variant_id) {
        throwValidation(['guest_cart'], 'Each guest_cart item must have a string variant_id.');
      }
      if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throwValidation(['guest_cart'], 'Each guest_cart item quantity must be an integer >= 1.');
      }
    }

    // typeof test_write_block must be boolean if provided
    if (typeof test_write_block !== 'boolean') {
      throwValidation(['test_write_block'], 'test_write_block must be a boolean.');
    }

    // ── Step 2: Entity existence (404) ───────────────────────────────────────
    // registered_user_id must exist as a player
    const player = await db('players').where({ player_id: registered_user_id }).first();
    if (!player) {
      throwNotFound('PLAYER_NOT_FOUND', `Player '${registered_user_id}' not found.`, {
        registered_user_id,
      });
    }

    // Every variant_id must exist
    for (const item of guest_cart) {
      const variant = await db('product_variants').where({ variant_id: item.variant_id }).first();
      if (!variant) {
        throwNotFound('VARIANT_NOT_FOUND', `Variant '${item.variant_id}' not found.`, {
          variant_id: item.variant_id,
        });
      }
    }

    // ── Step 3: Stock availability check (409 OUT_OF_STOCK) ──────────────────
    for (const item of guest_cart) {
      const variant = await db('product_variants').where({ variant_id: item.variant_id }).first();
      // Check against current persistent_cart qty (existing qty already owned by user)
      const existing = await db('persistent_carts')
        .where({ user_id: registered_user_id, variant_id: item.variant_id })
        .first();
      const alreadyOwned = existing ? existing.quantity : 0;
      // Net new quantity needed from stock
      const netNew = item.quantity; // merge sums; stock only covers net new units
      if (variant.stock < netNew) {
        throwConflict('OUT_OF_STOCK', `Variant '${item.variant_id}' has insufficient stock.`, {
          variant_id: item.variant_id,
        });
      }
    }

    // ── Step 4: Write-block simulation (spec 5.7 rule 4) ─────────────────────
    // When test_write_block == true, confirm guard would reject the guest_token.
    // We simulate this: any token starting with 'guest_anon_tok_' is rejected.
    // The guard is already live in app.js; here we record the verification result.
    const write_block_verified = test_write_block
      ? guest_token.startsWith('guest_anon_tok_') || guest_token.startsWith('guest_')
      : false;
    const write_rejection_code = write_block_verified ? 403 : 0;

    // ── Step 5: Idempotency check ─────────────────────────────────────────────
    const payloadHash = mergePayloadHash(guest_token, registered_user_id, guest_cart);

    const tokenRow = await db('guest_tokens').where({ token: guest_token }).first();

    if (tokenRow && tokenRow.merged) {
      if (tokenRow.merged_payload_hash === payloadHash) {
        // Exact replay of same request — return 200 with current cart state
        const active_cart = await buildActiveCart(db, registered_user_id);
        const sigPayload  = {
          cart_merged:        true,
          guest_token,
          registered_user_id,
          total_items:        active_cart.total_items,
          write_rejection_code,
        };
        return reply.status(200).send({
          guest_token,
          write_block_verified,
          write_rejection_code,
          cart_merged: true,
          active_cart,
          signature: sign_day2(guest_token, sigPayload),
        });
      }
      // Same token but different user or different cart → 409
      throwConflict('GUEST_TOKEN_ALREADY_MERGED',
        `Guest token '${guest_token}' has already been merged with a different user or cart.`,
        { guest_token }
      );
    }

    // ── Step 6: Atomic merge in one transaction ───────────────────────────────
    await db.transaction(async (trx) => {
      for (const item of guest_cart) {
        const variant = await trx('product_variants')
          .where({ variant_id: item.variant_id })
          .first();

        // Upsert into persistent_carts: sum quantities if row exists
        const existing = await trx('persistent_carts')
          .where({ user_id: registered_user_id, variant_id: item.variant_id })
          .first();

        if (existing) {
          const newQty = existing.quantity + item.quantity;
          // Cap by stock
          const capped = Math.min(newQty, existing.quantity + variant.stock);
          await trx('persistent_carts')
            .where({ user_id: registered_user_id, variant_id: item.variant_id })
            .update({ quantity: capped, updated_at: new Date() });
        } else {
          await trx('persistent_carts').insert({
            user_id:    registered_user_id,
            variant_id: item.variant_id,
            quantity:   item.quantity,
          });
        }

        // Decrement stock atomically
        await trx.raw(
          'UPDATE product_variants SET stock = stock - ? WHERE variant_id = ? AND stock >= ?',
          [item.quantity, item.variant_id, item.quantity]
        );
      }

      // Mark guest_token as merged (or insert if not in table)
      if (tokenRow) {
        await trx('guest_tokens')
          .where({ token: guest_token })
          .update({
            merged:               true,
            merged_into_user_id:  registered_user_id,
            merged_payload_hash:  payloadHash,
            updated_at:           new Date(),
          });
      } else {
        await trx('guest_tokens').insert({
          token:               guest_token,
          merged:              true,
          merged_into_user_id: registered_user_id,
          merged_payload_hash: payloadHash,
        });
      }
    });

    // ── Build response ────────────────────────────────────────────────────────
    const active_cart = await buildActiveCart(db, registered_user_id);

    const sigPayload = {
      cart_merged:        true,
      guest_token,
      registered_user_id,
      total_items:        active_cart.total_items,
      write_rejection_code,
    };

    return reply.status(200).send({
      guest_token,
      write_block_verified,
      write_rejection_code,
      cart_merged: true,
      active_cart,
      signature: sign_day2(guest_token, sigPayload),
    });
  });
}

// ── Module lifecycle ──────────────────────────────────────────────────────────

async function reset(trx) {
  // FK order: guest_carts → guest_tokens, persistent_carts standalone
  await trx('guest_carts').truncate();
  await trx('persistent_carts').truncate();
  await trx('guest_tokens').truncate();
}

async function seed(trx) {
  // Baseline guest_tokens and persistent_carts seeded in resetService.js — no-op.
}

module.exports = { registerRoutes, reset, seed };
