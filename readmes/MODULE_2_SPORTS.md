# Module 2 — Sports Configuration

## What the Backend Exposes
```
POST /audit/v1/sports
```
Creates a new sport purely from JSON config. No code changes needed on backend.

---

## What You Build (Frontend)

**No dedicated screen required for the competition judging.**

However, the sport config affects how you display scores and match details. You need to handle
all three scoring models in your UI:

### Scoring Models — Display Rules

#### 1. `event` model (Football, Basketball)
- Show a simple score: `Home 2 — 1 Away`
- Show event timeline (goals, baskets, etc.) with timestamps
- Period display: "1st Half", "Q1", etc. based on `periods.count`

#### 2. `innings` model (Cricket)
- Show: `Home 145/3 (16.2 ov) — Away 132/10 (20.0 ov)`
- Fields to display: `score` (runs), `wickets`, `overs` (e.g. "16.2")
- "Innings Complete" means all overs bowled or all wickets fallen

#### 3. `round` model (Esports)
- Show: `Home 2 — 1 Away` (rounds/maps won)
- Label: "Map 1", "Map 2", etc.
- Series format: "Best of 3", "Best of 5"

### How to Know Which Model to Use
When you fetch a match score from `GET /audit/v1/score/{match_id}`, the response includes
`sport_id`. Use that to look up the sport's `scoring_model` from a locally cached sports list.

### Seeded Sports Reference

| sport_id | model | display |
|----------|-------|---------|
| football | event | Goals, 2×45min halves |
| basketball | event | Points (1/2/3), 4×12min quarters |
| cricket | innings | Runs/wickets/overs, 20 overs T20 |
| esports | round | Rounds won, best-of-3 |

---

## Caching Sports Locally
Fetch and cache the sports list on app start (after `/health` passes).
Store in Hive/SQLite so it's available offline when showing match details.
