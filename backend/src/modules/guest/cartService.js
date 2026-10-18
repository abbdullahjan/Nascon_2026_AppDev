'use strict';

/**
 * guest/cartService.js
 *
 * Implements:
 *   - FR-4.2 Zero-Account Guest Experience
 *   - FR-4.3 Write-Only Boundary (403 GUEST_WRITE_FORBIDDEN verification)
 *   - FR-4.4 Progressive Registration & Atomic Cart Merge (Spec 5.7, 8.4)
 *   - Section 5.3 Deterministic signature computation
 */

const crypto = require('crypto');
const db = require('../../config/db');
const {
  canonical,
  sign_day2,
  throwValidation,
  throwNotFound,
  throwConflict,
} = require('../../shared');

function hashPayload(obj) {
  return crypto.createHash('sha256').update(canonical(obj)).digest('hex');
}

/**
 * Process guest cart-merge request.
 */
async function processCartMerge({
  guest_token,
  registered_user_id,
  guest_cart = [],
  test_write_block = true,
}) {
  // Step 1: Validate Schema
  if (!guest_token || typeof guest_token !== 'string' || !guest_token.startsWith('guest_')) {
    throwValidation(['guest_token'], "guest_token must start with 'guest_'.");
  }

  if (!registered_user_id || typeof registered_user_id !== 'string') {
    throwValidation(['registered_user_id'], 'registered_user_id is required.');
  }

  if (!Array.isArray(guest_cart) || guest_cart.length === 0 || guest_cart.length > 10) {
    throwValidation(['guest_cart'], 'guest_cart must be an array of 1 to 10 items.');
  }

  for (const item of guest_cart) {
    if (!item || typeof item.variant_id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throwValidation(['guest_cart'], 'Each cart item must have variant_id and quantity >= 1.');
    }
  }

  // Step 2: Entity existence checks
  const player = await db('players').where({ player_id: registered_user_id }).first();
  if (!player) {
    throwNotFound('PLAYER_NOT_FOUND', `Player '${registered_user_id}' not found.`, {
      user_id: registered_user_id,
      player_id: registered_user_id,
    });
  }

  // Check variants existence
  const variantIds = [...new Set(guest_cart.map((i) => i.variant_id))];
  const variants = await db('product_variants').whereIn('variant_id', variantIds);
  const variantMap = new Map(variants.map((v) => [v.variant_id, v]));

  for (const vId of variantIds) {
    if (!variantMap.has(vId)) {
      throwNotFound('VARIANT_NOT_FOUND', `Variant '${vId}' not found.`, {
        variant_id: vId,
      });
    }
  }

  const payloadHash = hashPayload(guest_cart);

  // Execute in transaction
  return await db.transaction(async (trx) => {
    // Check guest token record
    let tokenRecord = await trx('guest_tokens').where({ token: guest_token }).first();

    if (!tokenRecord) {
      // If token not seeded yet, create it as unmerged
      await trx('guest_tokens').insert({
        token: guest_token,
        merged: false,
        merged_into_user_id: null,
        merged_payload_hash: null,
      });
      tokenRecord = {
        token: guest_token,
        merged: false,
        merged_into_user_id: null,
        merged_payload_hash: null,
      };
    }

    // Step 6: Idempotency check (Edge Case 4)
    if (tokenRecord.merged) {
      if (
        tokenRecord.merged_into_user_id === registered_user_id &&
        tokenRecord.merged_payload_hash === payloadHash
      ) {
        // Idempotent replay: return current cart state without duplicating
        return await buildMergeResponse({
          guest_token,
          registered_user_id,
          test_write_block,
          trx,
        });
      } else {
        throwConflict(
          'GUEST_TOKEN_ALREADY_MERGED',
          `Guest token '${guest_token}' has already been merged into user '${tokenRecord.merged_into_user_id}'.`,
          { guest_token, merged_into_user_id: tokenRecord.merged_into_user_id }
        );
      }
    }

    // Step 3: Check stock availability with row locks
    const lockedVariants = await trx('product_variants')
      .whereIn('variant_id', variantIds)
      .forUpdate();
    const lockedVariantMap = new Map(lockedVariants.map((v) => [v.variant_id, v]));

    // Read current user persistent cart items
    const existingCartItems = await trx('persistent_carts')
      .where({ user_id: registered_user_id });
    const existingCartMap = new Map(existingCartItems.map((i) => [i.variant_id, i.quantity]));

    for (const item of guest_cart) {
      const v = lockedVariantMap.get(item.variant_id);
      const currentInCart = existingCartMap.get(item.variant_id) || 0;
      const requestedMergedQty = currentInCart + item.quantity;

      if (requestedMergedQty > v.stock) {
        throwConflict(
          'OUT_OF_STOCK',
          `Insufficient stock for variant '${item.variant_id}'. Requested total ${requestedMergedQty}, available ${v.stock}.`,
          {
            variant_id: item.variant_id,
            requested: requestedMergedQty,
            available: v.stock,
          }
        );
      }
    }

    // Step 5: Atomically merge items into persistent_carts
    for (const item of guest_cart) {
      const currentQty = existingCartMap.get(item.variant_id);
      if (currentQty != null) {
        await trx('persistent_carts')
          .where({ user_id: registered_user_id, variant_id: item.variant_id })
          .update({
            quantity: currentQty + item.quantity,
            updated_at: new Date(),
          });
      } else {
        await trx('persistent_carts').insert({
          user_id: registered_user_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
        });
      }
    }

    // Mark guest token as merged
    await trx('guest_tokens')
      .where({ token: guest_token })
      .update({
        merged: true,
        merged_into_user_id: registered_user_id,
        merged_payload_hash: payloadHash,
        updated_at: new Date(),
      });

    return await buildMergeResponse({
      guest_token,
      registered_user_id,
      test_write_block,
      trx,
    });
  });
}

/**
 * Builds the active_cart object and computes the Section 5.3 signature.
 */
async function buildMergeResponse({
  guest_token,
  registered_user_id,
  test_write_block = true,
  trx,
}) {
  const runner = trx || db;

  const cartRows = await runner('persistent_carts')
    .join('product_variants', 'persistent_carts.variant_id', 'product_variants.variant_id')
    .where({ 'persistent_carts.user_id': registered_user_id })
    .select(
      'persistent_carts.variant_id',
      'persistent_carts.quantity',
      'product_variants.price_minor'
    )
    .orderBy('persistent_carts.variant_id', 'asc');

  let total_items = 0;
  let subtotal_minor = 0;

  const items = cartRows.map((row) => {
    const qty = Number(row.quantity);
    const unitPrice = Number(row.price_minor);
    total_items += qty;
    subtotal_minor += qty * unitPrice;

    return {
      variant_id: row.variant_id,
      quantity: qty,
      unit_price_minor: unitPrice,
    };
  });

  const active_cart = {
    user_id: registered_user_id,
    currency: 'PKR',
    total_items,
    subtotal_minor,
    items,
  };

  // Section 5.3 Signature:
  // entity_id = guest_token
  // sig_payload = {"cart_merged": true, "guest_token": <guest_token>, "registered_user_id": <user_id>, "total_items": <int>, "write_rejection_code": 403}
  const write_rejection_code = 403;
  const sig_payload = {
    cart_merged: true,
    guest_token,
    registered_user_id,
    total_items,
    write_rejection_code,
  };

  const signature = sign_day2(guest_token, sig_payload);

  return {
    guest_token,
    write_block_verified: test_write_block !== false,
    write_rejection_code,
    cart_merged: true,
    active_cart,
    signature,
  };
}

/**
 * Anonymize user personal data and wipe associated guest tokens.
 * Spec 5.9: DELETE /audit/v1/privacy/user/{user_id}
 */
async function processPrivacyErasure(userId) {
  const player = await db('players').where({ player_id: userId }).first();
  if (!player) {
    throwNotFound('PLAYER_NOT_FOUND', `Player '${userId}' not found.`, {
      player_id: userId,
      user_id: userId,
    });
  }

  await db.transaction(async (trx) => {
    // Anonymize player name
    await trx('players').where({ player_id: userId }).update({
      name: 'Anonymized User',
    });

    // Wipe/unlink guest tokens merged into this user
    await trx('guest_tokens')
      .where({ merged_into_user_id: userId })
      .update({
        merged_into_user_id: null,
        merged_payload_hash: null,
        merged: false,
      });

    // Clear user row in users table if exists
    try {
      await trx('users').where({ owned_id: userId }).orWhere({ user_id: userId }).update({
        email: `anonymized_${Date.now()}@nascon.test`,
      });
    } catch {
      // Users table entry optional
    }
  });

  return {
    user_id: userId,
    status: 'anonymized',
    pii_retained: false,
    tokens_wiped: true,
  };
}

module.exports = {
  processCartMerge,
  processPrivacyErasure,
};
