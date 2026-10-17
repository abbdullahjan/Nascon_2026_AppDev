# Menma's Backend Modules
## Store, Roster, RBAC & Offline Sync Side

---

## Ownership Summary

| Module | Description | Priority |
|--------|-------------|----------|
| M7 | Roster & Transfers | Start after Ahmed does M0+M1+M2 |
| M8 | Merchandise Store & Checkout | Parallel with M7 |
| M9 | RBAC, Auth & Security | Parallel with M7/M8 |
| M10 | Offline Sync | After M5 (Ahmed) and M7 are done |

**Total graded points from your modules: ~14 of 36 backend points**

---

## When Can You Start?

Wait for Ahmed to finish **Module 0 + 1 + 2** (foundation, reset, sports).
That gives you:
- Running DB with all tables migrated
- Seeded baseline data (tenants, clubs, players, variants, demo users)
- Working `/health` endpoint

Estimated wait: **~30–40 minutes** after competition starts.

While waiting, read this file carefully and understand all 8 rule checks for Module 7.

---

## Module 7 — Roster & Transfers (~40 min)
Three endpoints:
- `POST /audit/v1/roster/setup`
- `POST /audit/v1/roster/transfer`
- `GET /audit/v1/roster/history/{player_id}?as_of=YYYY-MM-DD`

---

### 7A — Roster Setup
`POST /audit/v1/roster/setup`

- Re-sending same `league_id` → replaces that league's roster state (idempotent setup)
- Creates roster_leagues config, squads, player registrations, in-progress match tracking
- Response: `{"league_id":"lg-r1","status":"configured","squad_counts":{"sq-a":2,"sq-b":0}}`

**File:** `src/services/rosterService.js` → `setup()` ✓

---

### 7B — Transfer / Loan / Release
`POST /audit/v1/roster/transfer`

**8 rules checked in exact order — first failure wins:**

| # | Check | Error |
|---|-------|-------|
| 1 | Schema valid, dates valid, `loan_end_date > effective_date`, `to_squad_id` present unless release | 400 `VALIDATION_ERROR` |
| 2 | League / player / squads exist | 404 `LEAGUE_NOT_FOUND` / `PLAYER_NOT_FOUND` / `SQUAD_NOT_FOUND` |
| 3 | From and to squads same tenant | 409 `CROSS_TENANT_TRANSFER` |
| 4 | Player's current squad = from_squad_id | 409 `NOT_IN_SQUAD` |
| 5 | effective_date inside transfer window (release: skip) | 409 `TRANSFER_WINDOW_CLOSED` |
| 6 | Player not currently on loan | 409 `PLAYER_ON_LOAN` |
| 7 | to_squad count + 1 ≤ max_squad_size | 409 `SQUAD_FULL` |
| 8 | from_squad still has ≥ required count for player's position | 409 `MIN_POSITION_VIOLATION` |

**Effects after validation passes:**
- `transfer`: player moves permanently, new role = substitute; old captain/vc slot becomes vacant
- `loan`: player belongs to borrower from `effective_date` through `loan_end_date`; `parent_squad_id` = lender; counts toward borrower's size, not lender's
- `release`: player leaves the league (no squad)

**In-progress match edge case:**
- If player's squad has a live match → still accepted
- Response gets `state: "deferred_until_match_end"`, `blocking_match_id: <match_id>`
- Otherwise `state: "active"`, `blocking_match_id: null`

**Loan auto-return:**
- Day after `loan_end_date` → player back with lender (role = substitute)
- Grader passes `?as_of=` to history endpoint to check this
- Appears as `loan_return` audit entry with `who: "system"`
- Written once, never duplicated on repeated calls

**Idempotency:** Same `request_id` + same body → 200 with stored response. Same `request_id` + different body → 409.

**File:** `src/services/rosterService.js` → `transfer()` ✓

---

### 7C — Player History
`GET /audit/v1/roster/history/{player_id}?as_of=YYYY-MM-DD`

- `as_of` defaults to today's server date
- Returns `current_squad_id` = squad the player belongs to on that date
- History is oldest-first, append-only
- 404 `PLAYER_NOT_FOUND` if player doesn't exist

**File:** `src/services/rosterService.js` → `getHistory()` ✓

---

## Module 8 — Merchandise Store & Checkout (~35 min)
Two endpoints:
- `POST /audit/v1/checkout`
- `GET /audit/v1/inventory/{variant_id}`

**This module has the biggest single automated test: 20 simultaneous buyers on 1 unit → exactly 1 success.**

---

### 8A — Checkout
`POST /audit/v1/checkout`

**Processing order (exact):**
1. Validate schema → 400
2. Variants exist → 404 `VARIANT_NOT_FOUND`
3. Discount code valid → 400 `INVALID_DISCOUNT_CODE`
4. **Atomically reserve stock** (PostgreSQL `SELECT FOR UPDATE` inside a transaction)
   - Any item out of stock → release all, return 409 `OUT_OF_STOCK`
   - This is what prevents overselling under concurrency
5. Mock gateway:
   - `tok_success` → authorize + capture succeed
   - `tok_declined` → release reservation, return 402 `PAYMENT_DECLINED`
   - `tok_capture_fail` → void auth, release reservation, return 402 `PAYMENT_CAPTURE_FAILED`
6. On success: commit reservation permanently, status = paid, generate receipt

**Receipt requirements:**
- `receipt.signature` = `sign(order_id, receipt.payload)` using `src/utils/hmac.js`
- `receipt.pdf_base64` = base64 of a valid PDF (starts with `%PDF`)
- PDF must contain: the `order_id` AND the total as `PKR X.XX` (major units, 2 decimals)
- Use `src/utils/pdf.js` → `generateReceiptPDF()` ✓

**Money:** All amounts in minor units (paisa). `450000` = PKR 4500.00
- `discount_minor = floor(subtotal_minor * 10 / 100)` for WELCOME10

**Idempotency:** Same `order_id` + same body → 200 with stored response.

**File:** `src/services/checkoutService.js` ✓

---

### 8B — Inventory
`GET /audit/v1/inventory/{variant_id}`

Returns: `{ "variant_id": "...", "stock": 0, "reserved": 0 }`

- `stock` = units still available
- `reserved` = units held by in-flight checkouts (must be 0 after all requests complete)
- 404 `VARIANT_NOT_FOUND`

**File:** `src/services/inventoryService.js` ✓

---

### Concurrency Test (NFR-3) — What the grader does:
1. Calls `/reset` with `stock: {"var-jersey-001-M": 1}`
2. Fires 20 simultaneous checkout requests, each buying 1 unit of `var-jersey-001-M`
3. Expects: exactly 1 `201`, nineteen `409 OUT_OF_STOCK`, final stock = 0

**Your `SELECT FOR UPDATE` in a transaction is the correct solution. Do not use application-level locking.**

---

## Module 9 — RBAC, Auth & Security (~30 min)
Endpoints:
- `POST /audit/v1/rbac-matrix` — returns JWTs for all 5 roles
- 7 probe routes (`/audit/v1/rbac/*`) — authorization only checks
- `GET /api/v1/ping` — rate limit probe

---

### 9A — RBAC Matrix
`POST /audit/v1/rbac-matrix` — no auth required

Returns JWTs for: `super_admin`, `league_organizer`, `club_manager`, `player`, `viewer`
Plus the context IDs (exact ids from baseline seed — see `src/services/rbacService.js`)

**File:** `src/services/rbacService.js` → `getMatrix()` ✓

---

### 9B — Probe Routes (P1–P7)
All probe routes: authorize only, no mutation, send empty body `{}`

**Exact allow/deny matrix:**

| Probe | Path | Super Admin | Organizer | Club Mgr | Player | Viewer |
|-------|------|-------------|-----------|----------|--------|--------|
| P1 | POST /rbac/tenants | ✅ | ❌ | ❌ | ❌ | ❌ |
| P2 own league | POST /rbac/leagues/league-alpha-1/fixtures | ✅ | ✅ | ❌ | ❌ | ❌ |
| P2 other league (same tenant) | POST /rbac/leagues/league-alpha-2/fixtures | ✅ | ❌ | ❌ | ❌ | ❌ |
| P2 foreign league | POST /rbac/leagues/league-beta-1/fixtures | ✅ | ❌ | ❌ | ❌ | ❌ |
| P3/P4 own club | POST /rbac/clubs/club-alpha-1/roster | ✅ | ❌ | ✅ | ❌ | ❌ |
| P3/P4 other club | POST /rbac/clubs/club-alpha-2/roster | ✅ | ❌ | ❌ | ❌ | ❌ |
| P3/P4 foreign club | POST /rbac/clubs/club-beta-1/roster | ✅ | ❌ | ❌ | ❌ | ❌ |
| P5 own player | PATCH /rbac/players/player-alpha-1 | ✅ | ❌ | ✅ | ✅ | ❌ |
| P5 other player | PATCH /rbac/players/player-alpha-2 | ✅ | ❌ | ❌ | ❌ | ❌ |
| P5 foreign player | PATCH /rbac/players/player-beta-1 | ✅ | ❌ | ❌ | ❌ | ❌ |
| P6 own/other club (tenant-alpha) | GET /rbac/clubs/club-alpha-1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| P6 foreign club | GET /rbac/clubs/club-beta-1 | ✅ | ❌ | ❌ | ❌ | ❌ |
| P7 | GET /rbac/platform/config | ✅ | ❌ | ❌ | ❌ | ❌ |

**Cross-tenant access by non-super-admin = always 403 (not 404)**
**Authorization evaluated before anything else about the request**

Allowed → `200 {"authorized": true}`
Denied → `403 {"error": {"code": "FORBIDDEN", ...}}`
No/bad token → `401 {"error": {"code": "UNAUTHENTICATED", ...}}`

**File:** `src/routes/rbac.js` ✓, `src/services/rbacService.js` ✓, `src/middleware/auth.js` ✓

---

### 9C — JWT Security
The grader tests these explicitly:

| Test | Expected |
|------|----------|
| P7 with no Authorization header | 401 `UNAUTHENTICATED` |
| P7 with `alg:none` token | 401 `UNAUTHENTICATED` |
| P7 with tampered signature | 401 `UNAUTHENTICATED` |

`src/middleware/auth.js` already handles this with `{ algorithms: ['HS256'] }` ✓

---

### 9D — Rate Limiting
`GET /api/v1/ping` → `200 {"pong": true}`

- Limited to 100 req / 10s per client IP
- `/audit/v1/*` and `/health` are **exempt**
- On exceed: 429 `RATE_LIMITED` with `Retry-After` header
- 11s later: requests succeed again

Wire the rate-limit hook into `src/routes/ping.js`:
```js
// In ping.js, add preHandler:
fastify.get('/ping', { preHandler: rateLimitHook() }, async (req, reply) => {
  return reply.status(200).send({ pong: true });
});
```

**File:** `src/middleware/rateLimit.js` ✓, `src/routes/ping.js` ✓

---

### 9E — Additional Security Probes
| Test | Expected |
|------|----------|
| `sport_id = "x';DROP TABLE sports;--"` | 400 `VALIDATION_ERROR` (regex catches it) |
| `customer_id` with `<script>` | Stored/returned as plain data, never executed |
| Body > 1MB to any `/audit/v1/*` POST | 413 `PAYLOAD_TOO_LARGE` |

All handled in `src/app.js` and `src/utils/errors.js` ✓

---

## Module 10 — Offline Sync (~25 min)
`POST /audit/v1/offline-sync`

**Depends on:** Ahmed's Module 5 (events) and your Module 7 (roster) being done first.

---

### Processing Rules

1. Sort actions by `queued_at` ascending (ties: array order)
2. Process one by one, each against state left by previous
3. Return results in **original request order** (not processing order)

**Per-action result logic:**

| Situation | status | resolution | error_code |
|-----------|--------|------------|------------|
| Rules allow it, `base_version == current` | `applied` | `null` | null |
| Rules allow it, `base_version < current` | `applied` | `rebased_append` | null |
| Already processed (device_id + action_id seen before) | `duplicate` | `skipped_duplicate` | null |
| Any rule violation | `rejected` | `server_wins` | that rule's code |
| `base_version > current` | `rejected` | `server_wins` | `INVALID_BASE_VERSION` |
| Unknown id referenced | `rejected` | `server_wins` | `*_NOT_FOUND` |

**`base_version` means:**
- `score_event`: number of events in that match's log
- `roster_transfer`: number of audit entries for that player

**Full request idempotency:**
Re-sending the exact same request → every action returns `duplicate`, nothing changes

**Always returns HTTP 200** — conflicts are per-action inside the body.
Only a malformed envelope (missing device_id, actions not array, count outside 1–100) → 400.

**File:** `src/services/offlineSyncService.js` ✓

---

## Key Files You Own

```
backend/src/
├── routes/    roster.js, checkout.js, rbac.js, offlineSync.js, ping.js
├── services/  rosterService.js, checkoutService.js, inventoryService.js,
│              rbacService.js, offlineSyncService.js
└── utils/     pdf.js  ← you own this
```

---

## Grading Points Breakdown (your modules)

| Area | Points |
|------|--------|
| Store concurrency + PDF receipt | ~6 |
| Roster, transfers, loan rules | ~6 |
| RBAC 5-role matrix + security | ~5 |
| Offline sync | ~4 |
| **Total** | **~21** |

---

## Hourly Commit Reminder
- 10:45–11:45: Wait for M0+M1+M2, then start M7
- 11:45–12:45: Push M7 + M8 done
- 12:45–13:45: Push M9 done
- 13:45–14:45: Push M10 done (needs Ahmed's M5 first)
