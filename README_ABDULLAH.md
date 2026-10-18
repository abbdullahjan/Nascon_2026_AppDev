# README — ABDULLAH (Guest Experience, QR & Web Player)

Phase II, Day 2. Read `docs/SPEC_DAY2.md` and `.kiro/steering/project.md` first.
You own the guest-facing side: QR deep-links, guest access, cart merge, moderation, and the web player.

---

## 1. Folders you OWN (only you edit these)

| Folder / file | What it is |
|---|---|
| `backend/src/modules/qr/` | QR metadata, short links, exports, match status updates |
| `backend/src/modules/guest/` | Guest tokens, cart merge, privacy delete |
| `backend/src/modules/moderation/` | Chat moderation + DLQ |
| `backend/src/modules/web/` | Guest Web Player pages (`/web/*`) |
| `backend/tests/` files for your modules (`qr*`, `guest*`, `moderation*`, `web*`) | Your unit tests |
| `tests/selenium/` | Selenium suite |
| `tests/k6_load.js` | k6 script |
| Mobile app folder | `nascon://` intent filter, QR scanner, stream screens |
| Migrations with your prefixes (see `docs/CONVENTIONS.md`) | Your tables |

## 2. Folders you must NOT touch (Ahmed's)

- `backend/src/modules/streaming/`
- `backend/src/modules/costream/`
- `backend/src/modules/realtime/`
- `docker-compose.yml` — **ask Ahmed** if you need a change (new env var, port, service)
- `.github/workflows/autograde.yml`
- `tests/appium/`
- Ahmed's test files and migration prefixes

## 3. Shared files — FROZEN

`backend/src/shared/` and `backend/src/modules/index.js` are frozen after the baseline.
If you truly need a change: make a **small separate commit**, message it `shared: <what>`, and tell Ahmed right away.
Never put module logic into `shared/`.

---

## 4. Your task list (in priority order)

| # | Task | Spec | Difficulty |
|---|---|---|---|
| 1 | **QR module:** `GET /audit/v1/qr/{entity_id}` (+ `?inspect=true`), `GET /q/{short_code}` (302 to live target), dynamic `target_route` for match / player / club / co-stream, signature, `QR_NOT_FOUND` | 5.6 | Medium |
| 2 | **QR exports:** SVG (`<svg`), PNG (magic header), PDF (`%PDF-`, contains entity_id) | 5.6 | Medium |
| 3 | **Match status service:** export `applyMatchEvent(event)` from `backend/src/modules/qr/matchStatus.js` (handles `match_end` → completed, `postponed`, etc.). Ahmed's events route calls it. | 8.2 | Easy |
| 4 | **Cart merge:** `POST /audit/v1/guest/cart-merge`, exact validation order, stock check, write-block simulation, atomic merge, idempotent replay (`total_items: 1`, never 2), `GUEST_TOKEN_ALREADY_MERGED` | 5.7, 8.4 | Medium |
| 5 | **Moderation + DLQ:** leetspeak masking, flood drop + mute, deduped `kicked_users`/`muted_users` under 10 concurrent calls, DLQ depth, signature. Always return 200 (no rate limit here, for k6) | 5.8, 8.3 | Medium-Hard |
| 6 | **Privacy delete:** `DELETE /audit/v1/privacy/user/{user_id}` | 5.9 | Easy |
| 7 | **Guest Web Player:** pages for match `live`/`preview`/`vod`/`notice`, `/web/costream/{id}`, `/web/players/{id}`, `/web/clubs/{id}`; guest token issuance; all **9 `data-testid`** attributes; progressive auth modal; WCAG basics (contrast 4.5:1, keyboard nav, ARIA, touch targets 48px) | 6.2.2, NFR-8 | Medium |
| 8 | **Selenium tests:** `tests/selenium/test_guest_grid.py`, the 3 required cases, runnable with `pytest -n 3` | 6.2.3 | Medium |
| 9 | **k6 script:** paste spec 6.4 verbatim into `tests/k6_load.js` and run it | 6.4 | Easy |
| 10 | **Mobile:** `nascon://` intent filter in `AndroidManifest.xml`, screens for `nascon://entity/match-m1` and `nascon://stream/cs-session-101`, QR scanner | 6.3 | Medium |
| 11 | **FR-3.1 athlete profile + follow/unfollow** (no audit probe, lowest priority) | 3.1 | Medium |

The 9 `data-testid` values: `guest-video-player`, `live-score-banner`, `pinned-merch-card`, `add-to-guest-cart-btn`, `guest-cart-count`, `chat-message-list`, `chat-input-field`, `chat-send-btn`, `progressive-auth-modal`.

## 5. The interfaces between you and Ahmed

1. **Events route is Ahmed's.** You provide `applyMatchEvent(event)` in `backend/src/modules/qr/matchStatus.js`. Keep its signature stable and tell Ahmed when it's ready.
2. **Moderation service:** export `moderateMessage({ chat_room_id, message_id, sender, text })` from `backend/src/modules/moderation/service.js`. Ahmed's chat broadcast calls it before sending to viewers.
3. **Live score:** your web player connects to the fixed WS URL `ws://localhost:8080/ws/matches/{match_id}` (or SSE `/api/v1/matches/{match_id}/stream`). Agree the score event JSON with Ahmed in the first 15 minutes; it will be written in `docs/CONVENTIONS.md`. Build against it before his server is ready.
4. Guests must not post chat: `chat-send-btn` triggers a real request that the **server** rejects with 403 `GUEST_WRITE_FORBIDDEN`, then you open `progressive-auth-modal`. Hiding the button earns zero credit.

## 6. Hard rules (summary — full list in `.kiro/steering/project.md`)

- `DAY2_SALT` from env only. Signature message uses the **pipe `|`**. Use the shared `sign_day2`.
- Validation order: 400 → 404 → 403 → 409. Error envelope on every non-2xx.
- QR `short_url` never changes; `target_route` and `signature` are recomputed from the live DB state on every call.
- Scan telemetry: count, device family (mobile/desktop), UTC time bucket. **No IPs, no full User-Agent, no cookies.**
- Use transactions, unique constraints, upserts. No read-then-write races (cart merge, kicked/muted lists).
- Flood rule: use section **5.8** (≥ 4 identical chars OR ≥ 3 consecutive `!`/`?`), not 3.3.
- `/audit/v1/*` must never return 5xx under load.

## 7. Workflow

1. `git pull --rebase` before starting and before every push. Never force-push or amend pushed commits.
2. One module at a time with Kiro: plan (max 10 lines) → implement → unit tests → curl commands.
3. After each module: test it, **commit and push**.
4. **Push at least once in every window:** 10:15–11:30, 11:30–12:45, 12:45–13:45, 13:45–14:00 (hard stop 14:05).
5. Add your rows to `TRACEABILITY.md` as you finish each task (only your rows).
6. Near the end, put your real coverage numbers in `COVERAGE_DAY2.json` keys: `qr_guest`, `moderation_dlq`.
7. Save Selenium and k6 output into `tests/reports/` (`selenium-report.xml`, `k6-summary.json`).

## 8. Suggested timeline

| Time | Goal |
|---|---|
| 10:15–10:40 | Agree event JSON with Ahmed, start QR + `applyMatchEvent` |
| 10:40–11:30 | QR endpoints, redirect, exports → **push** |
| 11:30–12:45 | Cart merge, moderation + DLQ, privacy delete → **push** |
| 12:45–13:30 | Web player with all `data-testid`, Selenium tests, k6 run → **push** |
| 13:30–13:55 | Mobile deep-link, WCAG pass, regression run, final fixes |
| 13:45–14:00 | Final push (nothing risky) |

## 9. If you finish early

Ask Ahmed for his lowest-priority items: recording to RustFS, `autograde.yml`, or the Appium tests.
