'use strict';

process.env.DAY1_SALT = 'demo-salt';

// Mock DB and pdf to avoid real connections in unit tests
jest.mock('../src/config/db', () => {
  const variants = {
    'var-jersey-001-M': { variant_id: 'var-jersey-001-M', product_id: 'prod-jersey-001', price_minor: 450000, currency: 'PKR', stock: 1 },
  };
  const orders = {};
  const discounts = { 'WELCOME10': { code: 'WELCOME10', discount_type: 'percent', discount_value: 10 } };

  const trxMock = {
    fn: null,
  };

  const db = jest.fn((table) => ({
    where:     (q) => ({ first: async () => {
      if (table === 'product_variants') return variants[q.variant_id] || null;
      if (table === 'orders')           return orders[q.order_id] || null;
      if (table === 'discount_codes')   return discounts[q.code] || null;
      return null;
    }, forUpdate: () => ({ first: async () => variants[q.variant_id] || null }) },
    insert:    async (row) => { orders[row.order_id] = row; },
    decrement: async () => { if (variants['var-jersey-001-M']) variants['var-jersey-001-M'].stock--; },
    increment: async () => { if (variants['var-jersey-001-M']) variants['var-jersey-001-M'].stock++; },
  }));

  db.transaction = async (fn) => {
    const trx = db;
    trx.raw = async () => {};
    await fn(trx);
  };
  db.raw = async () => {};
  return db;
});

jest.mock('../src/utils/pdf', () => ({
  generateReceiptPDF: async () => 'bW9ja3BkZg==', // base64 of 'mockpdf'
}));

const checkoutService = require('../src/services/checkoutService');

describe('Checkout Service', () => {
  test('tok_success → paid order with signature', async () => {
    const result = await checkoutService.checkout({
      order_id: 'ord-001', customer_id: 'cust-1',
      items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
      discount_code: null,
      payment: { token: 'tok_success' },
    });
    expect(result.data.status).toBe('paid');
    expect(result.data.receipt.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(result.data.total_minor).toBe(450000);
  });

  test('tok_declined → 402 PAYMENT_DECLINED', async () => {
    await expect(
      checkoutService.checkout({
        order_id: 'ord-002', customer_id: 'cust-1',
        items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
        discount_code: null,
        payment: { token: 'tok_declined' },
      })
    ).rejects.toMatchObject({ httpStatus: 402, errorCode: 'PAYMENT_DECLINED' });
  });

  test('WELCOME10 applies 10% discount', async () => {
    const result = await checkoutService.checkout({
      order_id: 'ord-003', customer_id: 'cust-1',
      items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
      discount_code: 'WELCOME10',
      payment: { token: 'tok_success' },
    });
    expect(result.data.discount_minor).toBe(45000); // 10% of 450000
    expect(result.data.total_minor).toBe(405000);
  });

  test('invalid discount code → 400 INVALID_DISCOUNT_CODE', async () => {
    await expect(
      checkoutService.checkout({
        order_id: 'ord-004', customer_id: 'cust-1',
        items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
        discount_code: 'BADCODE',
        payment: { token: 'tok_success' },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'INVALID_DISCOUNT_CODE' });
  });
});
