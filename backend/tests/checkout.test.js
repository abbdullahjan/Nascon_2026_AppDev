'use strict';

process.env.DAY1_SALT = 'demo-salt';

// ── Stable in-memory state ──────────────────────────────────────────────────
const variants = {
  'var-jersey-001-M': { variant_id: 'var-jersey-001-M', product_id: 'prod-jersey-001', price_minor: 450000, currency: 'PKR', stock: 5 },
};
const orders    = {};
const discounts = { 'WELCOME10': { code: 'WELCOME10', discount_type: 'percent', discount_value: 10 } };

// ── Mock DB ─────────────────────────────────────────────────────────────────
jest.mock('../src/config/db', () => {
  const mockDb = jest.fn((table) => {
    return {
      where: (q) => {
        return {
          first: async () => {
            if (table === 'product_variants') return variants[q.variant_id] || null;
            if (table === 'orders')           return orders[q.order_id]    || null;
            if (table === 'discount_codes')   return discounts[q.code]     || null;
            return null;
          },
          forUpdate: () => ({
            first: async () => {
              if (table === 'product_variants') return variants[q.variant_id] || null;
              return null;
            },
          }),
          decrement: async (col, val) => {
            if (table === 'product_variants' && variants[q.variant_id]) {
              variants[q.variant_id].stock -= val;
            }
          },
          increment: async (col, val) => {
            if (table === 'product_variants' && variants[q.variant_id]) {
              variants[q.variant_id].stock += val;
            }
          },
        };
      },
      insert: async (row) => {
        if (table === 'orders') orders[row.order_id] = row;
      },
    };
  });

  mockDb.transaction = async (fn) => {
    // Simulate transaction: run fn with the mock db as trx
    await fn(mockDb);
  };
  mockDb.raw = async () => {};

  return mockDb;
});

jest.mock('../src/utils/pdf', () => ({
  generateReceiptPDF: async () => 'bW9ja3BkZg==',
}));

const checkoutService = require('../src/services/checkoutService');

// Reset stock before each test
beforeEach(() => {
  variants['var-jersey-001-M'].stock = 5;
});

describe('Checkout Service', () => {
  test('tok_success → paid order with 64-char hex signature', async () => {
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

  test('tok_capture_fail → 402 PAYMENT_CAPTURE_FAILED', async () => {
    await expect(
      checkoutService.checkout({
        order_id: 'ord-003', customer_id: 'cust-1',
        items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
        discount_code: null,
        payment: { token: 'tok_capture_fail' },
      })
    ).rejects.toMatchObject({ httpStatus: 402, errorCode: 'PAYMENT_CAPTURE_FAILED' });
  });

  test('WELCOME10 applies 10% discount correctly', async () => {
    const result = await checkoutService.checkout({
      order_id: 'ord-004', customer_id: 'cust-1',
      items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
      discount_code: 'WELCOME10',
      payment: { token: 'tok_success' },
    });
    expect(result.data.discount_minor).toBe(45000);   // 10% of 450000
    expect(result.data.total_minor).toBe(405000);
  });

  test('invalid discount code → 400 INVALID_DISCOUNT_CODE', async () => {
    await expect(
      checkoutService.checkout({
        order_id: 'ord-005', customer_id: 'cust-1',
        items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
        discount_code: 'BADCODE',
        payment: { token: 'tok_success' },
      })
    ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'INVALID_DISCOUNT_CODE' });
  });

  test('unknown variant → 404 VARIANT_NOT_FOUND', async () => {
    await expect(
      checkoutService.checkout({
        order_id: 'ord-006', customer_id: 'cust-1',
        items: [{ variant_id: 'var-does-not-exist', quantity: 1 }],
        discount_code: null,
        payment: { token: 'tok_success' },
      })
    ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'VARIANT_NOT_FOUND' });
  });
});
