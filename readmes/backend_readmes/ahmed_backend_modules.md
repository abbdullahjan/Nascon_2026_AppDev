# Ahmed's Backend Modules
## Scoring Engine + Fixture Algorithms Side

---

## Ownership Summary

| Module | Description | Priority |
|--------|-------------|----------|
| M0 | Foundation (app setup, DB, Redis, health) | **Do first — unblocks Menma** |
| M1 | Reset & baseline seeding | **Do first — unblocks Menma** |
| M2 | Sports (mystery sport from JSON) | **Do first — unblocks Menma** |
| M3 | Fixture algorithms (round-robin, swiss, single/double elim) | After M2 |
| M4 | League registration | After M2 |
| M5 | Event-sourced scoring engine | After M4 |
| M6 | Standings engine | After M5 |

**Total graded points from your modules: ~22 of 36 backend points**

---

## Do This First (Unblocks Menma)

Before splitting, get these 3 done together so Menma can start in parallel:

### Module 0 — Foundation (~15 min)
- `src/index.js` starts Fastify on port 8080
- DB connects (run migrations via `src/db/seed.js`)
- Redis connects
- Global error handler wired in `src/app.js`
- `GET /health` returns `200 {"status":"ok"}` when DB is reachable

**Files:**
- `src/index.js` ✓
- `src/app.js` ✓
- `src/config/db.js` ✓
- `src/config/redis.js` ✓
- `src/routes/health.js` ✓

**Test:** `curl http://localhost:8080/health` → `{"status":"ok"}`

---

### Module 1 — Reset (~20 min)
- `POST /audit/v1/reset` wipes all tables and re-seeds baseline
- Must be repeatable — calling it twice leaves identical state
- Seeds: 4 sports, 2 tenants, 3 clubs, 3 leagues, 3 players, 5 demo users, 2 variants, discount code

**Files:**
- `src/routes/reset.js` ✓
- `src/services/resetService.js` ✓
- `src/db/migrations/001_initial_schema.js` ✓

**Test:** Call reset twice, compare responses — must be identical.

---

### Module 2 — Sports (~20 min)
- `POST /audit/v1/sports` creates a sport from pure JSON config
- Validates all fields (sport_id regex, scoring_model, periods, scoring_events, roster)
- Stores as data in `sports` table — zero hard-coded sport names in logic
- `draw_lots` always appended last in `tie_break_order`
- 409 `SPORT_EXISTS` on duplicate

**Files:**
- `src/routes/sports.js` ✓
- `src/services/sportsService.js` ✓

**Critical rule:** Never write `if (sport_id === 'football')` or `if (event_type === 'goal')` anywhere.
The mystery-sport grading vector will fail your whole module if you do.

**Test:** Create kabaddi sport from spec example, then try creating it again → 409.

---

## Your Main Modules

### Module 3 — Fixture Algorithms (~45 min)
`POST /audit/v1/fixtures` — pure computation, stores nothing

**4 sub-modules (do in order):**

#### 3A — Round Robin
File: `src/algorithms/roundRobin.js` ✓ (scaffold exists)

Key rules to implement correctly:
- Circle method for home/away rotation
- Odd teams: exactly 1 bye per round, every team gets exactly 1 bye per leg
- Legs=2: every ordered pair (home,away) meets exactly once
- Home/away balance: within each leg, `|home - away| <= 1` per team
- `withdrawal_policy: forfeit_remaining` → fixtures after `after_round` get `status:"forfeit"`, `awarded_to` = opponent
- `withdrawal_policy: void_all` → all fixtures involving that team → `status:"voided"`, `awarded_to:null`
- Match ID format: `RR-L{leg}-R{round}-M{index}` (index resets per round)

#### 3B — Swiss
File: `src/algorithms/swiss.js` ✓ (scaffold exists)

Key rules:
- Round 1 (exact): pair seed i with seed i+m, last seed gets bye for odd n
- Rounds ≥ 2: backtracking to find minimum score-diff pairing with no rematches
- Bye: lowest-scoring team that hasn't had a bye (tie → largest index)
- Buchholz = sum of current scores of all opponents actually played (bye = 0)
- 409 `NO_VALID_PAIRING` if no valid pairing exists for any bye candidate

#### 3C — Single Elimination
File: `src/algorithms/singleElim.js` ✓ (scaffold exists)

Key rules:
- `order(2k) = for each s in order(k): [s, 2k+1-s]`
- `order(8) = [1,8,4,5,2,7,3,6]`
- Seeds > n = BYE matches (bye:true, away:null, winner = present team immediately)
- Winner of R{r}M{i} → R{r+1}M{ceil(i/2)}, slot: home if i odd, away if even
- `third_place_match:true` adds TP match fed by both semifinal losers

#### 3D — Double Elimination
File: `src/algorithms/doubleElim.js` ✓ (scaffold exists)

Key rules:
- WR seeding identical to single elim
- LR rounds: 2*(k-1) total; LR(2j-1) and LR(2j) have B/2^(j+1) matches each
- GF2: `conditional:true`; `required` = null until GF1 result; then true only if losers-bracket champion wins GF1
- `bracket_reset:true` → include GF2 in response

**Test vectors to verify manually:**
- n=5 round-robin → 5 rounds, 2 matches per round, 1 bye per round
- n=6 single elim → bracket_size=8, 2 bye matches in R1
- n=8 double elim → 3 WR rounds, 4 LR rounds, grand_final with 2 matches

---

### Module 4 — League Registration (~20 min)
`POST /audit/v1/leagues`

Key rules:
- Sport must exist → 404 `SPORT_NOT_FOUND`
- League ID duplicate → 409 `LEAGUE_EXISTS`
- Match ID duplicate → 409 `MATCH_EXISTS`
- Each fixture's home/away must be in the teams list
- All fixtures become matches with `status: upcoming` in the `matches` table
- Default points: win=3, draw=1, loss=0
- Default tie_break_order: from the sport's config
- `qualification.spots` required

**File:** `src/services/leaguesService.js` ✓

---

### Module 5 — Event-Sourced Scoring Engine (~45 min)
`POST /audit/v1/events` + `GET /audit/v1/score/{match_id}`

**This is the most graded module. Get it right.**

Key rules for `appendEvent`:
- All 7 event types: `match_init`, `match_start`, `score`, `discipline`, `tiebreak_winner`, `match_end`, `compensation`
- State machine (exact): upcoming → in_progress → completed. Illegal → 409 `ILLEGAL_TRANSITION`
- `score` events: validate `team_id` is home/away, validate `event_type` exists in sport config → 400 `UNKNOWN_EVENT_TYPE`
- Innings limits: legal balls ≥ overs×bpo OR wickets ≥ wickets_per_innings → 409 `INNINGS_COMPLETE`
- Round limits: team rounds ≥ ceil((best_of+1)/2) → 409 `SERIES_ALREADY_DECIDED`
- Compensating event: append new event referencing original; original row never modified
- Already compensated → 409 `INVALID_COMPENSATION`
- Idempotency: same event_id + same body → 200 with stored response
- Same event_id + different body → 409 `DUPLICATE_EVENT_ID`
- HMAC sign every event: `sign(event_id, payload)` from `src/utils/hmac.js`
- `sequence` = 1-based position in that match's log (all event types count)
- `match_version` = total events in log after append

Key rules for `getScore`:
- Rebuild from event log EVERY time — never read mutable counters
- Skip compensated events and compensation events themselves (both neutral)
- `outcome`: pending while not completed; home_win/away_win/draw/undecided when completed
- Innings model: compute `overs` as string `"{balls div bpo}.{balls mod bpo}"`
- `winner_team_id`: higher score, or active tiebreak_winner, or null

**Files:** `src/services/eventsService.js` ✓, `src/services/scoreService.js` ✓

---

### Module 6 — Standings Engine (~30 min)
`GET /audit/v1/standings/{league_id}`

Key rules:
- Recompute from scratch on EVERY call
- Only matches with `status=completed` AND `outcome != undecided` count as played
- H2H matrix: all ordered pairs, zeros when never met
- Tie-breaker: recursive `resolveGroup()` — split tied groups, restart from first criterion on each sub-group
- `h2h_points/h2h_diff`: computed only over matches among the tied group (mini-league)
- `draw_lots`: `SHA256("{seed}|{league_id}|{team_id}")` ascending = best rank
- `clinched/eliminated/still_possible`: based on points only (ignore tie-breaks)
- `resolved_by`: name of criterion that separated a team from the next

**Files:** `src/services/standingsService.js` ✓

**Test vector (draw_lots, Appendix A):**
- Seed 42, league lg-1: t1 < t3 < t2 (ascending hash order)

---

## Key Files You Own

```
backend/src/
├── routes/       health.js, reset.js, sports.js, fixtures.js, leagues.js, events.js, standings.js
├── services/     resetService.js, sportsService.js, fixturesService.js,
│                 leaguesService.js, eventsService.js, scoreService.js, standingsService.js
├── algorithms/   roundRobin.js, swiss.js, singleElim.js, doubleElim.js
└── utils/        hmac.js  ← critical, shared with Menma
```

---

## Grading Points Breakdown (your modules)

| Area | Points |
|------|--------|
| Fixture algorithms (×4 formats) | ~10 |
| Event-sourced scoring engine | ~8 |
| Standings engine | ~7 |
| Shared (health/reset/sports) | ~3 |
| **Total** | **~28** |

---

## Hourly Commit Reminder
- 10:45–11:45: Push M0+M1+M2 done
- 11:45–12:45: Push M3+M4 done
- 12:45–13:45: Push M5 done
- 13:45–14:45: Push M6 done
