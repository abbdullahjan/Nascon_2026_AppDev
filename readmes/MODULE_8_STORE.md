# Module 8 — Merchandise Store & Checkout

## What the Backend Exposes
```
POST /audit/v1/checkout              — place an order (concurrency-safe)
GET  /audit/v1/inventory/{variant_id} — check current stock
```

---

## What You Build

### Screen: Store / Product Catalogue
**Accessible from bottom nav for all roles**

**Display:**
- Grid or list of products
- Each product card:
  - Product image (placeholder if none)
  - Product name
  - Price: format as "PKR 4,500.00" (convert from minor units: divide by 100)
  - "In Stock" / "Out of Stock" badge (check inventory)
- Tap product → opens Product Detail screen

---

### Screen: Product Detail
**Shown when tapping a product from catalogue**

**Display:**
- Product name, description
- Price (formatted)
- **Variant picker:**
  - Size buttons (M, L, XL, etc.) — highlight selected
  - Color swatches if applicable
  - Show stock per variant from `GET /audit/v1/inventory/{variant_id}`
  - Disable / grey out variants with `stock: 0`
- Quantity selector (1 to available stock)
- "Add to Cart" button (disabled if out of stock)

---

### Screen: Cart
**Accessible from store / top-right cart icon**

**Display:**
- List of items: variant, quantity, unit price, line total
- Subtotal
- Discount code input field + "Apply" button
  - Valid: `WELCOME10` → shows "-10%" and updated total
  - Invalid: show "Invalid discount code" inline error
- Total (after discount)
- "Proceed to Checkout" button

---

### Screen: Checkout
**Reached from Cart**

**Display:**
- Order summary (items, quantities, prices)
- Subtotal, discount, **Total in PKR**
- Payment section (mock gateway):
  - Pre-filled token selector for demo (this is a competition app):
    - "Success" → token: `tok_success`
    - "Declined" → token: `tok_declined`
    - "Capture Fail" → token: `tok_capture_fail`
  - Or a simple text field for the token
- "Place Order" button

**On submit:** `POST /audit/v1/checkout`

**Loading state:** Show spinner and disable button — prevent double-tap.

**Success (201):** Navigate to Receipt screen.

**Errors to handle:**
| Error code | User message |
|------------|--------------|
| `OUT_OF_STOCK` | "Sorry, [variant] is out of stock" |
| `PAYMENT_DECLINED` | "Payment was declined. Please try a different method." |
| `PAYMENT_CAPTURE_FAILED` | "Payment authorized but capture failed. Please try again." |
| `INVALID_DISCOUNT_CODE` | "That discount code is not valid" |
| `VARIANT_NOT_FOUND` | "One of the items is no longer available" |

---

### Screen: Receipt
**Shown after successful checkout**

**Display:**
- Order ID
- Items purchased with quantities and prices
- Subtotal, discount applied, **Total: PKR X,XXX.XX**
- Payment confirmation (auth ID, capture ID)
- Timestamp (paid_at)
- **"Download PDF Receipt" button**
  - The `receipt.pdf_base64` field in the response is a base64 PDF
  - Decode and save to device / open in PDF viewer

**API success response to parse:**
```json
{
  "order_id": "ord-001",
  "status": "paid",
  "currency": "PKR",
  "items": [ { "variant_id": "...", "quantity": 1, "unit_price_minor": 450000 } ],
  "subtotal_minor": 450000,
  "discount_minor": 0,
  "total_minor": 450000,
  "receipt": {
    "payload": { ... },
    "signature": "...",
    "pdf_base64": "..."
  }
}
```

**Money formatting helper:**
```dart
String formatMoney(int minorUnits) {
  double major = minorUnits / 100.0;
  return "PKR ${major.toStringAsFixed(2)}";
}
// 450000 → "PKR 4500.00"
```

---

### Pinned Product on Match Detail (Module 5)
- When a product is pinned to a match, show a compact product card on Match Detail
- Card: product image, name, price, "Buy Now" button → opens Product Detail

---

## Role Visibility
| Role | Can See / Do |
|------|-------------|
| All roles | Browse store, add to cart, checkout |
| Club Manager | Can also pin products to matches (if implemented) |
| No role restriction | Store is open to everyone |

---

## Inventory Note
- `stock` in the inventory response = units available to buy
- `reserved` = units held by in-flight checkouts (should be 0 after all requests complete)
- Always refresh inventory when opening Product Detail
