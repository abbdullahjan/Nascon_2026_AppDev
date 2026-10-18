# Guest Cart Merge Integration Guide (Flutter)

## Base URL
- Web / Chrome: `http://localhost:8080`
- Android emulator: `http://10.0.2.2:8080`

---

## Guest Token

Issued by the backend as `guest_anon_tok_7721` (seeded). Format: starts with `guest_anon_tok_`.
Read-only: any write attempt with this token returns **403 GUEST_WRITE_FORBIDDEN**.

**Write guard export name (for Ahmed to mount):** `guestWriteGuard`
Import: `const { guestWriteGuard } = require('../middleware/guestGuard');`
Already active on `POST /audit/v1/checkout`, `POST /api/v1/chat`, `POST /audit/v1/events` via `app.js` global hook.

---

## POST /audit/v1/guest/cart-merge

Atomically merges guest cart into a registered user's persistent cart.

**Headers:** `Content-Type: application/json`

**Request:**
```json
{
  "guest_token": "guest_anon_tok_7721",
  "registered_user_id": "player-alpha-1",
  "guest_cart": [
    { "variant_id": "var-jersey-001-L", "quantity": 1 }
  ],
  "test_write_block": true
}
```

**Success 200:**
```json
{
  "guest_token": "guest_anon_tok_7721",
  "write_block_verified": true,
  "write_rejection_code": 403,
  "cart_merged": true,
  "active_cart": {
    "user_id": "player-alpha-1",
    "currency": "PKR",
    "total_items": 1,
    "subtotal_minor": 450000,
    "items": [
      { "variant_id": "var-jersey-001-L", "quantity": 1, "unit_price_minor": 450000 }
    ]
  },
  "signature": "7f8e9d0c1b2a3f4e..."
}
```

**Error codes:**
| HTTP | code | trigger |
|------|------|---------|
| 400  | `VALIDATION_ERROR` | missing field, bad type, `guest_token` not starting with `guest_`, quantity < 1 |
| 403  | `GUEST_WRITE_FORBIDDEN` | write attempt with `guest_anon_tok_*` token |
| 404  | `PLAYER_NOT_FOUND` | `registered_user_id` not in players table |
| 404  | `VARIANT_NOT_FOUND` | a `variant_id` in `guest_cart` not in product_variants |
| 409  | `OUT_OF_STOCK` | requested quantity exceeds available stock (`details.variant_id`) |
| 409  | `GUEST_TOKEN_ALREADY_MERGED` | token reused with different user or different cart |

**curl:**
```sh
curl -i -X POST http://localhost:8080/audit/v1/guest/cart-merge \
  -H "Content-Type: application/json" \
  -d '{"guest_token":"guest_anon_tok_7721","registered_user_id":"player-alpha-1","guest_cart":[{"variant_id":"var-jersey-001-L","quantity":1}],"test_write_block":true}'
```

**Guard curl (expect 403):**
```sh
curl -i -X POST http://localhost:8080/audit/v1/checkout \
  -H "Authorization: Bearer guest_anon_tok_7721" \
  -H "Content-Type: application/json" -d '{}'
```

---

## Flutter Notes

- UI reads: `active_cart.total_items` (cart badge), `active_cart.items` (cart list), `active_cart.subtotal_minor` (price in paisa, divide by 100 for PKR display).
- On **403 GUEST_WRITE_FORBIDDEN**: open the `progressive-auth-modal` (login/register). After login, replay the merge with `registered_user_id` set to the authenticated user's ID.
- On **409 GUEST_TOKEN_ALREADY_MERGED** with same payload: parse the existing `active_cart` from a fresh `GET` — the merge already succeeded; skip re-merging and proceed to checkout.
