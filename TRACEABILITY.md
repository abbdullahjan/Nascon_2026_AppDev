# TRACEABILITY.md
## NaSCon '26 — Functional & Non-Functional Requirement Traceability Matrix

Each requirement ID maps to the source file(s) that implement it and the test file(s) that verify it.

---

## FR-1.1 — Multi-Sport Taxonomy and Event-Sourced Scoring

| Item | File |
|------|------|
| Sport creation from JSON | `backend/src/services/sportsService.js` |
| Sport config storage (no hard-coded logic) | `backend/src/db/migrations/001_initial_schema.js` → `sports` table |
| Event-sourced scoring engine | `backend/src/services/eventsService.js`, `backend/src/services/scoreService.js` |
| Compensating events | `backend/src/services/eventsService.js` |
| HMAC signature | `backend/src/utils/hmac.js` |
| Route | `backend/src/routes/events.js` |
| Tests | `backend/tests/hmac.test.js`, `backend/tests/sports.test.js` |

---

## FR-1.2 — League and Tournament Setup

| Item | File |
|------|------|
| League registration | `backend/src/services/leaguesService.js` |
| Route | `backend/src/routes/leagues.js` |
| Tests | `backend/tests/fixtures.test.js` |

---

## FR-1.3 — Match and Fixture Scheduling

| Item | File |
|------|------|
| Round-robin algorithm | `backend/src/algorithms/roundRobin.js` |
| Swiss-system algorithm | `backend/src/algorithms/swiss.js` |
| Single elimination | `backend/src/algorithms/singleElim.js` |
| Double elimination | `backend/src/algorithms/doubleElim.js` |
| Fixture service dispatcher | `backend/src/services/fixturesService.js` |
| Route | `backend/src/routes/fixtures.js` |
| Tests | `backend/tests/fixtures.test.js` |

---

## FR-1.4 — Automated Standings and Tables

| Item | File |
|------|------|
| Standings computation | `backend/src/services/standingsService.js` |
| H2H matrix | `backend/src/services/standingsService.js` |
| Tie-breaker algorithm (all 6 criteria) | `backend/src/services/standingsService.js` → `applyTiebreakers()` |
| draw_lots deterministic hash | `backend/src/services/standingsService.js` → `computeCriterion()` |
| Qualification status | `backend/src/services/standingsService.js` → `getQualStatus()` |
| Route | `backend/src/routes/standings.js` |
| Tests | `backend/tests/standings.test.js` |

---

## FR-2.1 — Club Profiles and Tenant Isolation

| Item | File |
|------|------|
| Tenants table | `backend/src/db/migrations/001_initial_schema.js` → `tenants` table |
| Clubs table | `backend/src/db/migrations/001_initial_schema.js` → `clubs` table |
| Baseline seed | `backend/src/services/resetService.js` |

---

## FR-2.2 — Roster and Player Registry

| Item | File |
|------|------|
| Roster setup | `backend/src/services/rosterService.js` → `setup()` |
| Transfer / loan / release (8-rule validation) | `backend/src/services/rosterService.js` → `transfer()` |
| Immutable audit trail | `backend/src/services/rosterService.js` → `getHistory()` |
| Loan auto-return | `backend/src/services/rosterService.js` |
| Deferred transfer (in-progress match) | `backend/src/services/rosterService.js` |
| Routes | `backend/src/routes/roster.js` |

---

## FR-2.3 — Integrated Club Merchandise Store

| Item | File |
|------|------|
| Concurrency-safe checkout (SELECT FOR UPDATE) | `backend/src/services/checkoutService.js` |
| Mock payment gateway | `backend/src/services/checkoutService.js` → `mockGateway()` |
| PDF receipt generation | `backend/src/utils/pdf.js` |
| HMAC-signed receipt | `backend/src/utils/hmac.js` |
| Inventory check | `backend/src/services/inventoryService.js` |
| Routes | `backend/src/routes/checkout.js` |
| Tests | `backend/tests/checkout.test.js` |

---

## FR-5.1 — Five-Tier Role-Based Access Control

| Item | File |
|------|------|
| JWT generation (5 roles) | `backend/src/services/rbacService.js` → `getMatrix()` |
| Probe authorization logic | `backend/src/services/rbacService.js` → `checkProbe()` |
| JWT verification middleware | `backend/src/middleware/auth.js` |
| Probe routes (P1–P7) | `backend/src/routes/rbac.js` |
| Tests | `backend/tests/rbac.test.js` |

---

## NFR-3 — Concurrency Correctness

| Item | File |
|------|------|
| Atomic stock reservation | `backend/src/services/checkoutService.js` → `db.transaction()` + `forUpdate()` |
| Tests | `backend/tests/checkout.test.js` |

---

## NFR-4 — Offline Tolerance

| Item | File |
|------|------|
| Offline sync endpoint | `backend/src/services/offlineSyncService.js` |
| Per-action conflict resolution | `backend/src/services/offlineSyncService.js` → `processAction()` |
| Route | `backend/src/routes/offlineSync.js` |
| Mobile implementation | `flutter/nascon_26/` |

---

## NFR-5 — Security

| Item | File |
|------|------|
| JWT auth (alg:none rejection, tamper check) | `backend/src/middleware/auth.js` |
| Rate limiting (100 req/10s on /api/v1/*) | `backend/src/middleware/rateLimit.js` |
| Input validation (SQL injection → 400) | `backend/src/utils/errors.js`, all service validators |
| 1MB body limit → 413 | `backend/src/app.js` |
| RBAC boundary enforcement | `backend/src/routes/rbac.js`, `backend/src/services/rbacService.js` |

---

## NFR-7 — Reproducibility

| Item | File |
|------|------|
| Single-command startup | `docker-compose.yml` (Docker teammate) |
| DB migrations + seeding | `backend/src/db/migrations/001_initial_schema.js`, `backend/src/db/seed.js` |
| Reset endpoint | `backend/src/services/resetService.js` |
| Health probe | `backend/src/routes/health.js` |
