'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { sign }     = require('../utils/hmac');
const { generateReceiptPDF } = require('../utils/pdf');
const { v4: uuidv4 } = require('uuid');

// Mock payment gateway
function mockGateway(token) {
  if (token === 'tok_success')      return { auth: `auth_${uuidv4()}`, capture: `cap_${uuidv4()}`, state: 'captured', error: null };
  if (token === 'tok_declined')     return { auth: null, capture: null, state: 'declined', error: 'PAYMENT_DECLINED' };
  if (token === 'tok_capture_fail') return { auth: `auth_${uuidv4()}`, capture: null, state: 'capture_failed', error: 'PAYMENT_CAPTURE_FAILED' };
  return { auth: null, capture: null, state: 'declined', error: 'PAYMENT_DECLINED' };
}

async function checkout(body) {
  const { order_id, customer_id, items, discount_code, payment } = body;

  // Idempotency
  const existing = await db('orders').where({ order_id }).first();
  if (existing) {
    const bodyStr = JSON.stringify(body);
    if (existing.raw_body === bodyStr) return { _isReplay: true, data: JSON.parse(existing.response_body) };
    throw new AppError(409, 'DUPLICATE_ORDER_ID', `Order id '${order_id}' already used with a different body.`, {});
  }

  // Step 1 — Validate
  if (!order_id || !customer_id || !Array.isArray(items) || items.length < 1 || items.length > 10) {
    throw new AppError(400, 'VALIDATION_ERROR', 'order_id, customer_id, and 1-10 items are required.', { fields: [] });
  }

  // Validate discount code
  let discountRow = null;
  if (discount_code) {
    discountRow = await db('discount_codes').where({ code: discount_code }).first();
    if (!discountRow) throw new AppError(400, 'INVALID_DISCOUNT_CODE', `Discount code '${discount_code}' is not valid.`, {});
  }

  // Step 2 — Check variants exist and compute totals
  const resolvedItems = [];
  for (const item of items) {
    const variant = await db('product_variants').where({ variant_id: item.variant_id }).first();
    if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', `Variant '${item.variant_id}' not found.`, { variant_id: item.variant_id });
    resolvedItems.push({ ...item, unit_price_minor: variant.price_minor, variant });
  }

  // Step 3 — Atomically reserve stock (SELECT FOR UPDATE)
  await db.transaction(async (trx) => {
    for (const item of resolvedItems) {
      const row = await trx('product_variants')
        .where({ variant_id: item.variant_id })
        .forUpdate()
        .first();

      if (!row || row.stock < item.quantity) {
        throw new AppError(409, 'OUT_OF_STOCK', `Variant '${item.variant_id}' has no stock left.`, { variant_id: item.variant_id });
      }
      await trx('product_variants')
        .where({ variant_id: item.variant_id })
        .decrement('stock', item.quantity);
    }
  });

  // Step 4 — Call mock payment gateway
  const gw = mockGateway(payment?.token);
  if (gw.error === 'PAYMENT_DECLINED') {
    // Release reservation
    for (const item of resolvedItems) {
      await db('product_variants').where({ variant_id: item.variant_id }).increment('stock', item.quantity);
    }
    throw new AppError(402, 'PAYMENT_DECLINED', 'Payment was declined.', {});
  }
  if (gw.error === 'PAYMENT_CAPTURE_FAILED') {
    for (const item of resolvedItems) {
      await db('product_variants').where({ variant_id: item.variant_id }).increment('stock', item.quantity);
    }
    throw new AppError(402, 'PAYMENT_CAPTURE_FAILED', 'Payment capture failed.', {});
  }

  // Step 5 — Commit order
  const subtotal = resolvedItems.reduce((s, i) => s + i.unit_price_minor * i.quantity, 0);
  const discountMinor = discountRow
    ? Math.floor(subtotal * discountRow.discount_value / 100)
    : 0;
  const total = subtotal - discountMinor;
  const paidAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const receiptPayload = {
    order_id, customer_id,
    items: resolvedItems.map(i => ({ variant_id: i.variant_id, quantity: i.quantity, unit_price_minor: i.unit_price_minor })),
    subtotal_minor: subtotal,
    discount_minor: discountMinor,
    total_minor:    total,
    currency:       'PKR',
    paid_at:        paidAt,
  };

  const signature  = sign(order_id, receiptPayload);
  const pdfBase64  = await generateReceiptPDF(receiptPayload);

  const responseData = {
    order_id,
    status:         'paid',
    currency:       'PKR',
    items:          resolvedItems.map(i => ({ variant_id: i.variant_id, quantity: i.quantity, unit_price_minor: i.unit_price_minor })),
    subtotal_minor: subtotal,
    discount_minor: discountMinor,
    total_minor:    total,
    payment:        { authorization_id: gw.auth, capture_id: gw.capture, state: gw.state },
    receipt:        { payload: receiptPayload, signature, pdf_base64: pdfBase64 },
  };

  await db('orders').insert({
    order_id, customer_id,
    status:         'paid',
    subtotal_minor: subtotal,
    discount_minor: discountMinor,
    total_minor:    total,
    currency:       'PKR',
    raw_body:       JSON.stringify(body),
    response_body:  JSON.stringify(responseData),
  });

  return { _isReplay: false, data: responseData };
}

module.exports = { checkout };
