'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { sign }     = require('../utils/hmac');
const { generateReceiptPDF } = require('../utils/pdf');
const { v4: uuidv4 } = require('uuid');

// ── Mock payment gateway ────────────────────────────────────────────────────
function mockGateway(token) {
  if (token === 'tok_success')      return { auth: `auth_${uuidv4()}`, capture: `cap_${uuidv4()}`, state: 'captured', error: null };
  if (token === 'tok_declined')     return { auth: null, capture: null, state: 'declined',       error: 'PAYMENT_DECLINED' };
  if (token === 'tok_capture_fail') return { auth: `auth_${uuidv4()}`, capture: null, state: 'capture_failed', error: 'PAYMENT_CAPTURE_FAILED' };
  return { auth: null, capture: null, state: 'declined', error: 'PAYMENT_DECLINED' };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Atomically reserve `quantity` units of `variant_id`.
 * Uses UPDATE ... WHERE stock >= qty so exactly one concurrent buyer wins
 * when only 1 unit remains. Returns false if insufficient stock.
 */
async function reserveStock(trx, variant_id, quantity) {
  const result = await trx.raw(`
    UPDATE product_variants
    SET    stock    = stock    - ?,
           reserved = reserved + ?
    WHERE  variant_id = ?
      AND  stock >= ?
  `, [quantity, quantity, variant_id, quantity]);

  // result.rowCount is 0 when the WHERE condition was not met (out of stock)
  return result.rowCount > 0;
}

/** Release a reservation (on payment failure) without permanently consuming stock. */
async function releaseReservation(trx, variant_id, quantity) {
  await trx.raw(`
    UPDATE product_variants
    SET    stock    = stock    + ?,
           reserved = reserved - ?
    WHERE  variant_id = ?
  `, [quantity, quantity, variant_id]);
}

/** Commit a reservation (on payment success) — reserved goes to 0 for this order. */
async function commitReservation(trx, variant_id, quantity) {
  await trx.raw(`
    UPDATE product_variants
    SET    reserved = reserved - ?
    WHERE  variant_id = ?
  `, [quantity, variant_id]);
}

// ── Main checkout ────────────────────────────────────────────────────────────
async function checkout(body) {
  const { order_id, customer_id, items, discount_code, payment } = body;

  // ── Idempotency ──────────────────────────────────────────────────────────
  const existing = await db('orders').where({ order_id }).first();
  if (existing) {
    if (existing.raw_body === JSON.stringify(body)) {
      return { _isReplay: true, data: JSON.parse(existing.response_body) };
    }
    throw new AppError(409, 'DUPLICATE_ORDER_ID', `Order id '${order_id}' already used with a different body.`, {});
  }

  // ── Step 1: Validate envelope ────────────────────────────────────────────
  if (!order_id || !customer_id || !Array.isArray(items) || items.length < 1 || items.length > 10) {
    throw new AppError(400, 'VALIDATION_ERROR', 'order_id, customer_id, and 1–10 items are required.', { fields: [] });
  }

  // Discount code
  let discountRow = null;
  if (discount_code) {
    discountRow = await db('discount_codes').where({ code: discount_code }).first();
    if (!discountRow) throw new AppError(400, 'INVALID_DISCOUNT_CODE', `Discount code '${discount_code}' is not valid.`, {});
  }

  // ── Step 2: Resolve variants ─────────────────────────────────────────────
  const resolvedItems = [];
  for (const item of items) {
    const variant = await db('product_variants').where({ variant_id: item.variant_id }).first();
    if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', `Variant '${item.variant_id}' not found.`, { variant_id: item.variant_id });
    resolvedItems.push({ variant_id: item.variant_id, quantity: item.quantity, unit_price_minor: variant.price_minor });
  }

  // ── Step 3: Atomically reserve stock in a transaction ────────────────────
  // Use a single transaction so all-or-nothing reservation is guaranteed.
  // Each UPDATE is atomic at the row level; no separate lock needed.
  let reserved = false;
  await db.transaction(async (trx) => {
    for (const item of resolvedItems) {
      const ok = await reserveStock(trx, item.variant_id, item.quantity);
      if (!ok) {
        // Release anything already reserved in this loop before throwing
        for (const prev of resolvedItems) {
          if (prev === item) break;
          await releaseReservation(trx, prev.variant_id, prev.quantity);
        }
        throw new AppError(409, 'OUT_OF_STOCK', `Variant '${item.variant_id}' has no stock left.`, { variant_id: item.variant_id });
      }
    }
    reserved = true;
  });

  // ── Step 4: Call mock payment gateway ────────────────────────────────────
  const gw = mockGateway(payment?.token);

  if (gw.error) {
    // Release all reservations
    await db.transaction(async (trx) => {
      for (const item of resolvedItems) {
        await releaseReservation(trx, item.variant_id, item.quantity);
      }
    });
    const code = gw.error === 'PAYMENT_CAPTURE_FAILED' ? 'PAYMENT_CAPTURE_FAILED' : 'PAYMENT_DECLINED';
    const msg  = code === 'PAYMENT_CAPTURE_FAILED' ? 'Payment capture failed.' : 'Payment was declined.';
    throw new AppError(402, code, msg, {});
  }

  // ── Step 5: Commit — persist order, order_items, release reserved ────────
  const subtotal     = resolvedItems.reduce((s, i) => s + i.unit_price_minor * i.quantity, 0);
  const discountMinor = discountRow ? Math.floor(subtotal * discountRow.discount_value / 100) : 0;
  const total        = subtotal - discountMinor;
  const paidAt       = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const receiptPayload = {
    order_id, customer_id,
    items:          resolvedItems,
    subtotal_minor: subtotal,
    discount_minor: discountMinor,
    total_minor:    total,
    currency:       'PKR',
    paid_at:        paidAt,
  };

  const signature = sign(order_id, receiptPayload);
  const pdfBase64 = await generateReceiptPDF(receiptPayload);

  const responseData = {
    order_id,
    status:         'paid',
    currency:       'PKR',
    items:          resolvedItems,
    subtotal_minor: subtotal,
    discount_minor: discountMinor,
    total_minor:    total,
    payment:        { authorization_id: gw.auth, capture_id: gw.capture, state: gw.state },
    receipt:        { payload: receiptPayload, signature, pdf_base64: pdfBase64 },
  };

  await db.transaction(async (trx) => {
    // Insert order record
    await trx('orders').insert({
      order_id, customer_id,
      status:         'paid',
      subtotal_minor: subtotal,
      discount_minor: discountMinor,
      total_minor:    total,
      currency:       'PKR',
      raw_body:       JSON.stringify(body),
      response_body:  JSON.stringify(responseData),
    });

    // Insert order_items
    for (const item of resolvedItems) {
      await trx('order_items').insert({
        order_id,
        variant_id:       item.variant_id,
        quantity:         item.quantity,
        unit_price_minor: item.unit_price_minor,
      });
    }

    // Commit reservations (reserved -= quantity, stock already decremented in step 3)
    for (const item of resolvedItems) {
      await commitReservation(trx, item.variant_id, item.quantity);
    }
  });

  return { _isReplay: false, data: responseData };
}

module.exports = { checkout };
