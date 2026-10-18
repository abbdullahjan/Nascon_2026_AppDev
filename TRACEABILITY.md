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
| Mobile implementation | `mobile/` |

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

---

## Phase II — Module 0: Shared Foundation

| Item | File |
|------|------|
| `canonical()` — key sorting, non-ASCII unescaped | `backend/src/shared/canonical.js` |
| `sign_day2()` — HMAC-SHA256 with DAY2_SALT + pipe | `backend/src/shared/sign.js` |
| Error helpers (`throwValidation`, `throwNotFound`, etc.) | `backend/src/shared/errors.js` |
| `Validator` class — schema validation | `backend/src/shared/validate.js` |
| Centralised env config (DAY2_SALT, S3_*, MEDIA_*) | `backend/src/shared/config.js` |
| Module auto-loader (`registerAll`, `resetAll`, `seedAll`) | `backend/src/modules/index.js` |
| Guest write guard middleware | `backend/src/middleware/guestGuard.js` |
| Phase II baseline migration (8 tables) | `backend/src/db/migrations/100_phase2_baseline.js` |
| Phase II seed data (match-m1, QR mappings, guest token) | `backend/src/services/resetService.js` |
| Tests | `backend/tests/shared.test.js` |

---

## Phase II — Module 1: Real-Time (NFR-1, NFR-6, FR-5.2)

| Item | File |
|------|------|
| In-process WS + SSE client registry + Prometheus counters | `backend/src/modules/realtime/store.js` |
| Redis pub/sub broadcaster (psubscribe `match:*`) | `backend/src/modules/realtime/broadcaster.js` |
| Async broadcast hook on POST /audit/v1/events | `backend/src/modules/realtime/eventsHandler.js` |
| Prometheus `/metrics` text formatter | `backend/src/modules/realtime/metricsHandler.js` |
| Routes: WS `/ws/matches/:id`, SSE `/api/v1/matches/:id/stream`, GET `/metrics` | `backend/src/modules/realtime/index.js` |
| Tests | `backend/tests/realtime.test.js` |

---

## Phase II — Module 2: Streaming (FR-3.2, Section 5.4)

| Item | File |
|------|------|
| Stream key generate / rotate / revoke (transactions) | `backend/src/modules/streaming/keyService.js` |
| Key format `^sk_live_[a-f0-9]{16}$`, `stream_key_override` | `backend/src/modules/streaming/keyService.js` |
| 4-key sig_payload per Section 5.3 | `backend/src/modules/streaming/keyService.js` → `buildSigPayload()` |
| RTMP / WebRTC / HLS URL builder from env | `backend/src/modules/streaming/keyService.js` → `buildUrls()` |
| MediaMTX external auth hook (POST /internal/mediamtx/auth) | `backend/src/modules/streaming/mediamtx.js` → `makeAuthHandler()` |
| Kick publisher (DELETE MediaMTX control API, 2 s deadline) | `backend/src/modules/streaming/mediamtx.js` → `kickPublisher()` |
| Route: POST /audit/v1/stream/key | `backend/src/modules/streaming/index.js` |
| Tests | `backend/tests/streaming.test.js` |

---

## Phase II — Module 3: Co-Stream (FR-3.3, Section 5.5)

| Item | File |
|------|------|
| 5-step validation (schema → existence → capacity → layout → handoff) | `backend/src/modules/costream/sessionService.js` → `processSession()` |
| Host-drop handoff state machine (3 scenarios) | `backend/src/modules/costream/sessionService.js` |
| Idempotent replay (same session_id → 200 stored result) | `backend/src/modules/costream/sessionService.js` |
| Signature per Section 5.3 (6-key payload) | `backend/src/modules/costream/sessionService.js` → `buildSigPayload()` |
| Route: POST /audit/v1/costream/session | `backend/src/modules/costream/index.js` |
| Tests | `backend/tests/costream.test.js` |

### Spec Conflict Resolution: Layout Capacity Check (Step 4)

**Question:** Does the layout capacity check (step 4) use the participant count _before_ or _after_ the simulated host drop (step 5)?

**Decision:** **Before** the host drop.

**Rationale:** The spec lists step 4 before step 5 in the ordered validation sequence. The phrase "effective active participant count" refers to what the caller is requesting, not the result of the drop simulation. Checking capacity on the post-drop count would mean `grid_2` could never be validated against the actual broadcast layout before the drop occurs — which contradicts the purpose of the layout validation step.

**Agreed by:** Ahmed (Person B). Abdullah to confirm and countersign here if he disagrees.

---

## Phase II — Module 4: Appium Tests (Section 6.3)

| Item | File |
|------|------|
| Appium 2 test suite | `tests/appium/test_mobile_deeplink.py` |
| Shared fixtures (driver, reset, helpers) | `tests/appium/conftest.py` |
| Python dependencies | `tests/appium/requirements.txt` |
| pytest config | `tests/appium/pytest.ini` |
| Android deep-link intent-filter (`nascon://`) | `mobile/android/app/src/main/AndroidManifest.xml` |
| Test reports output dir | `tests/reports/appium-report.xml` |

### Test Cases

| ID | Description | Spec |
|---|---|---|
| TC-A1 | Appium 2 server `GET /status` → `ready: true` | 6.3 |
| TC-A2 | Backend `GET /health` → 200 ok | 6.1 |
| TC-A3 | Selenium Grid `GET /status` → `ready: true`, ≥ 3 nodes | 6.1 |
| TC-A4 | `adb am start nascon://entity/match-m1` opens app in < 2 s, Status: ok | 6.3 |
| TC-A5 | `adb am start nascon://stream/cs-session-101` opens app in < 2 s | 6.3 |
| TC-A6 | App stays in foreground after deep-link (no crash, no login wall) | 6.3 |
| TC-A7 | Appium driver: app launches with MainActivity, no crash | 6.3 |
| TC-A8 | Appium driver: `nascon://entity/match-m1` navigates to match screen in < 2 s | 6.3 |
| TC-A9 | Appium driver: `nascon://stream/cs-session-101` opens co-stream screen, no login wall | 6.3 |
| TC-A10 | Cross-surface: mobile joins cs-session-101 + browser opens `/web/costream/cs-session-101` within 3 s | 6.3 |

### Run Command
```bash
pytest tests/appium/ -v --junitxml=tests/reports/appium-report.xml
```
