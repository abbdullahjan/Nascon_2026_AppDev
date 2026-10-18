# README — AHMED (Streaming & Real-Time Platform)

Phase II, Day 2. Read `docs/SPEC_DAY2.md` and `.kiro/steering/project.md` first.
You own the **hardest** backend pieces: media pipeline, co-stream state machine, real-time delivery and observability.

---

## 1. Folders you OWN (only you edit these)

| Folder / file | What it is |
|---|---|
| `backend/src/modules/streaming/` | Stream keys, MediaMTX auth hook, ingest sever, recording |
| `backend/src/modules/costream/` | Co-stream sessions, host handoff |
| `backend/src/modules/realtime/` | WebSocket/SSE, `/metrics`, `POST /audit/v1/events` handler, chat broadcast |
| `backend/tests/` files for your modules (`streaming*`, `costream*`, `realtime*`) | Your unit tests |
| `docker-compose.yml` | **You are the only editor.** If Abdullah needs a change, he asks you. |
| `.github/workflows/autograde.yml` | CI workflow |
| `tests/appium/` | Appium suite |
| Migrations with your prefixes (see `docs/CONVENTIONS.md`) | Your tables |

## 2. Folders you must NOT touch (Abdullah's)

- `backend/src/modules/guest/`
- `backend/src/modules/qr/`
- `backend/src/modules/moderation/`
- `backend/src/modules/web/`
- `tests/selenium/`, `tests/k6_load.js`
- Abdullah's test files and migration prefixes
- The mobile app folder

## 3. Shared files — FROZEN

`backend/src/shared/` and `backend/src/modules/index.js` are frozen after the baseline.
If you truly need a change: make a **small separate commit**, message it `shared: <what>`, and tell Abdullah right away.
Never put module logic into `shared/`.

---

## 4. Your task list (in priority order)

| # | Task | Spec | Difficulty |
|---|---|---|---|
| 1 | **Events + real-time:** `POST /audit/v1/events` (score events), WS `ws://localhost:8080/ws/matches/{match_id}` and SSE `GET /api/v1/matches/{match_id}/stream`, Redis pub/sub fan-out, p95 < 500 ms to 25 clients | 4 (NFR-1) | Hard |
| 2 | **Stream keys:** generate / rotate / revoke, `stream_key_override`, format `^sk_live_[a-f0-9]{16}$`, signature (accept 4-key payload), `KEY_REVOKED` 409 | 5.4 | Hard |
| 3 | **MediaMTX integration:** external auth hook so your API decides who may publish; on rotate/revoke kick the active publisher via MediaMTX control API within **2 s** | 3.1 (FR-3.2) | Hard |
| 4 | **Co-stream session:** 5 ordered validation steps, host-drop handoff (`participants[0]` removed → next is host), solo termination, idempotent replay (200), `chat-{session_id}`, signature | 5.5, 8.1 | Hard |
| 5 | **`/metrics`:** the 5 gauges/counters, content type `text/plain; version=0.0.4` | 4 (NFR-6), 5.9 | Medium |
| 6 | **Recording to RustFS + VOD index** on stream end (S3 SDK, env vars only) | 3.1 | Medium (lowest priority) |
| 7 | **`autograde.yml`:** on push to `main`, run contract probes, Selenium node check, k6 smoke | 1.3 | Medium |
| 8 | **Appium tests:** `tests/appium/test_mobile_deeplink.py` + one cross-surface test (mobile joins `cs-session-101`, browser verifies chat in 3 s) | 6.3 | Medium |

If you finish early, ask Abdullah which of his items to take over (suggest: moderation or the mobile `nascon://` intent filter).

## 5. The interfaces between you and Abdullah

1. **`POST /audit/v1/events`** — YOUR route handler (realtime module). For match status changes (`match_end`, `postponed`, ...) it calls:
   `require('../qr/matchStatus').applyMatchEvent(event)` — Abdullah provides this function (updates `match.status` in the DB).
   Until it exists, call a stub that does nothing. Do not edit his folder to add it.
2. **Chat:** your realtime module broadcasts chat. Before broadcasting it calls Abdullah's `require('../moderation/service').moderateMessage(...)`. Stub it until it lands.
3. **WS URL contract is fixed by the spec** — Abdullah's web player codes against it, so never change the URL or message shape without telling him. Agree on the score event JSON in the first 15 minutes (e.g. `{ "type": "score", "match_id", "home", "away" }`) and write it in `docs/CONVENTIONS.md`.
4. The guest write guard already exists in the baseline. Do not duplicate it.

## 6. Hard rules (summary — full list in `.kiro/steering/project.md`)

- `DAY2_SALT` from env only. Signature message uses the **pipe `|`**. Use the shared `sign_day2`.
- Validation order: 400 → 404 → 403 → 409. Error envelope on every non-2xx.
- Use transactions / unique constraints / Redis atomics. No read-then-write races.
- `/audit/v1/*` must never return 5xx under load.
- Spec conflict on layout capacity: ask whether "effective participant count" is before or after the host drop, decide with Abdullah, write the decision in `TRACEABILITY.md`.
- Zero zombie FFmpeg/WebRTC processes after handoff or termination.

## 7. Workflow

1. `git pull --rebase` before starting and before every push. Never force-push or amend pushed commits.
2. One module at a time with Kiro: plan (max 10 lines) → implement → unit tests → curl commands.
3. After each module: run it with curl, **commit and push**.
4. **Push at least once in every window:** 10:15–11:30, 11:30–12:45, 12:45–13:45, 13:45–14:00 (hard stop 14:05).
5. Add your rows to `TRACEABILITY.md` as you finish each task (only your rows).
6. Near the end, put your real coverage numbers in your part of `COVERAGE_DAY2.json` keys: `streaming`, `costream`, `observability`.

## 8. Suggested timeline

| Time | Goal |
|---|---|
| 10:15–10:40 | Agree event JSON with Abdullah, start events + WS |
| 10:40–11:30 | WS/SSE done and measured, stream keys done → **push** |
| 11:30–12:45 | MediaMTX auth + sever, co-stream → **push** |
| 12:45–13:30 | `/metrics`, autograde.yml, Appium, recording if time → **push** |
| 13:30–13:55 | Full clean `docker compose up`, regression run, final fixes |
| 13:45–14:00 | Final push (nothing risky) |
