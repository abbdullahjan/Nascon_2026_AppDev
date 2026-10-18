# NaSCon '26 Phase II — Development Conventions

This document is the binding reference for both team members. Follow it before
writing any Phase II code. When in doubt, this file wins over verbal agreements.

---

## 1. Folder Layout

```
backend/
├── src/
│   ├── app.js                  # Fastify app factory — DO NOT restructure
│   ├── index.js                # Entry point: migrations → seed → listen
│   ├── config/                 # Phase I config (db, env, redis) — frozen
│   ├── db/
│   │   └── migrations/         # Knex migration files — numbered by prefix
│   ├── middleware/             # auth.js, rateLimit.js, guestGuard.js
│   ├── modules/                # Phase II feature modules (auto-loaded)
│   │   ├── index.js            # Registry: registerAll / resetAll / seedAll
│   │   ├── costream/           # Person B
│   │   ├── guest/              # Person A
│   │   ├── moderation/         # Person B
│   │   ├── qr/                 # Person A
│   │   ├── realtime/           # Person B
│   │   ├── streaming/          # Person B
│   │   └── web/                # Person A
│   ├── routes/                 # Phase I route files — extend, don't rewrite
│   ├── services/               # Phase I service files — extend, don't rewrite
│   ├── shared/                 # Phase II shared utilities (frozen after Module 0)
│   │   ├── canonical.js        # canonical(obj) — single source of truth
│   │   ├── sign.js             # sign_day2(entityId, sigPayload)
│   │   ├── errors.js           # throwValidation/throwNotFound/throwConflict/throwForbidden
│   │   ├── validate.js         # Validator class
│   │   ├── config.js           # All env vars including DAY2_SALT, S3_*, MEDIA_*
│   │   └── index.js            # Barrel export — import from here
│   └── utils/                  # Phase I utils (errors.js, hmac.js, pdf.js) — frozen
├── tests/                      # Jest unit tests — one file per module/feature
└── package.json
docs/
├── CONVENTIONS.md              # ← this file
└── SPEC_DAY2.md                # Binding spec — read before every task
tests/
├── selenium/                   # Selenium Grid 4 pytest suite (Person A)
├── appium/                     # Appium 2 mobile test suite (Person B)
├── k6_load.js                  # k6 load profile (shared)
└── reports/                    # Generated test output (committed)
```

---

## 2. How to Add a New Module

1. Create `src/modules/<name>/index.js` exporting exactly three functions:

```js
async function registerRoutes(app) { /* register Fastify routes */ }
async function reset(trx)          { /* TRUNCATE own tables */      }
async function seed(trx)           { /* INSERT baseline rows */     }
module.exports = { registerRoutes, reset, seed };
```

2. The registry (`src/modules/index.js`) auto-discovers it — no edits needed there.
3. Create your migration with the correct numeric prefix (see Section 3).
4. Add your routes under the `audit/v1` or `/api/v1` prefix inside `registerRoutes`.
5. Use `src/shared/` for all signing, validation, and error throwing.

---

## 3. Migration Numbering

| Prefix range | Owner        | Purpose                                  |
|:-------------|:-------------|:-----------------------------------------|
| 001–009      | Phase I      | Initial schema + fixes (frozen)          |
| 100–109      | Module 0     | Phase II baseline tables (frozen)        |
| 210–219      | Person A     | `qr_*` table changes                     |
| 310–319      | Person B     | `moderation_*` / `dlq_*` table changes   |
| 410–419      | Person B     | `stream_keys_*` table changes            |
| 510–519      | Person B     | `costream_*` table changes               |
| 610–619      | Person A     | `guest_*` / `persistent_carts_*` changes |
| 710–719      | Person B     | `realtime_*` / WebSocket state changes   |
| 810–819      | Person A     | `web_*` / metrics table changes          |

File naming: `<prefix>_<short_description>.js`
Example: `210_qr_add_deep_link_uri.js`

Rules:
- Never edit an existing migration. Add a new one.
- Never reorder migration files — Knex runs them in filename order.
- Always implement both `exports.up` and `exports.down`.

---

## 4. Error & Validation Conventions

**Validation order (mandatory everywhere — spec section 5.2):**

```
400 VALIDATION_ERROR  →  404 *_NOT_FOUND  →  403 FORBIDDEN  →  409 CONFLICT
```

**Always use `src/shared/` helpers — never roll your own:**

```js
const { throwValidation, throwNotFound, throwConflict, throwForbidden,
        Validator } = require('../../shared');

// Schema check (400)
const v = new Validator(body);
v.require('action', 'string', { enum: ['generate','rotate','revoke'] });
v.require('player_id', 'string');
v.throw(); // throws 400 if any field failed

// Entity existence (404)
const player = await db('players').where({ player_id }).first();
if (!player) throwNotFound('PLAYER_NOT_FOUND', `Player '${player_id}' not found.`, { player_id });

// Business conflict (409)
if (participants.length > 4) throwConflict('COSTREAM_SESSION_FULL', 'Max 4 participants.');
```

**Standard error envelope — every non-2xx response:**

```json
{
  "error": {
    "code": "PLAYER_NOT_FOUND",
    "message": "Human-readable description.",
    "details": { "player_id": "player-xyz" }
  }
}
```

---

## 5. Signing Convention (DAY2_SALT)

Every Phase II audit response includes a `signature` field. Use `sign_day2` from
`src/shared/sign.js`:

```js
const { sign_day2 } = require('../../shared');

// entity_id and sig_payload defined per endpoint in spec Section 5.3 table
const signature = sign_day2(entityId, sigPayload);
```

- `DAY2_SALT` comes **only** from `process.env.DAY2_SALT`. Never hard-code it.
- `canonical()` is the single function in `src/shared/canonical.js`. Never duplicate it.
- The pipe `|` separates `entity_id` from `canonical(sig_payload)` — always.
- `sig_payload` keys are defined exactly in the Section 5.3 table. No extra keys.

---

## 6. Ownership Table

| Module       | Person | Audit endpoint(s)                                  |
|:-------------|:-------|:---------------------------------------------------|
| `guest`      | A      | `POST /audit/v1/guest/cart-merge`                  |
| `qr`         | A      | `GET /audit/v1/qr/:entity_id`, `/q/:short_code`    |
| `web`        | A      | `/web/*` Guest Web Player HTML routes              |
| `moderation` | B      | `POST /audit/v1/moderation/test`                   |
| `realtime`   | B      | WebSocket/SSE hub, `GET /metrics`                  |
| `streaming`  | B      | `POST /audit/v1/stream/key`                        |
| `costream`   | B      | `POST /audit/v1/costream/session`                  |
| `shared/`    | Both   | Frozen after Module 0 — small changes in own PRs   |

Cross-module changes (e.g. a new column a module B needs on a module A table)
must be discussed and committed as a separate numbered migration by the table owner.

---

## 7. Concurrency Rules

- Never do read-then-write outside a transaction. Use Knex `trx`.
- Use `INSERT … ON CONFLICT DO UPDATE` (upsert) or `ON CONFLICT DO NOTHING` for
  idempotent operations.
- Use `FOR UPDATE` row locks when updating counters (e.g. `scan_count`):
  ```js
  await trx('qr_mappings').where({ entity_id }).forUpdate().increment('scan_count', 1);
  ```
- Redis atomic ops (`INCR`, `SET NX`, Lua scripts) for in-memory counters.
- No bare `++` on DB values read into JS — always increment in SQL.

---

## 8. Rate Limiter Exemption

`/audit/v1/*` routes are **exempt** from the 100 req/10 s IP rate limiter.
Do not add `rateLimitHook` to any audit route. The k6 load test sends 550
concurrent VUs and needs zero 429 responses.

---

## 9. Environment Variables

All env vars are declared in `src/shared/config.js`. Read from there:

```js
const { config } = require('../../shared');
// config.DAY2_SALT, config.S3_ENDPOINT, config.MEDIA_HOST, etc.
```

Never read `process.env.*` directly in module code — always go through `config`.

**Never commit secrets.** `.env` is in `.gitignore`. `docker-compose.yml` injects
`DAY1_SALT` and `DAY2_SALT` from the host environment via `${DAY1_SALT}` syntax.

---

## 10. Test Conventions

- One Jest test file per module: `backend/tests/<module>.test.js`.
- Target ≥ 85% line coverage per module (`npm run test:coverage`).
- Set env vars at the top of the test file before any `require()`:
  ```js
  process.env.DAY2_SALT = 'T01D27ad7ffff12e';
  process.env.DAY1_SALT = 'demo-salt';
  ```
- Mock DB and Redis in unit tests — do not hit real Postgres/Redis in `jest --runInBand`.
- Integration tests that need a real DB go in a separate `*.integration.test.js` file.
- Commit `COVERAGE_DAY2.json` at root before code freeze with actual percentages.

---

## 11. Git Workflow

```bash
git pull --rebase origin main   # always before pushing
git add <specific files>        # never `git add .` blindly
git commit -m "feat(module): description"
git push -u origin main
```

- Never force-push, `--amend` pushed commits, or `reset --hard` on shared history.
- Never commit `.env`, `*.pem`, or any salt value.
- Each module implemented in a focused commit or PR; do not bundle unrelated modules.
