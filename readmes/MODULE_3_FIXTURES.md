# Module 3 — Fixtures & Brackets

## What the Backend Exposes
```
POST /audit/v1/fixtures
```
Pure computation — generates schedules/brackets. Does not store anything.
Supports 4 formats: `round_robin`, `swiss`, `single_elim`, `double_elim`.

---

## What You Build

### Screen: Fixtures List
**Route:** accessible from bottom nav / home for all roles

**Display:**
- List of all matches for a selected league
- Each match card shows:
  - Home team vs Away team
  - Match status badge: `Upcoming` / `In Progress` / `Completed` / `Postponed` / `Abandoned` / `Cancelled`
  - Date and time (formatted from ISO 8601 UTC → local time)
  - Score if completed or in-progress (e.g. "2 — 1")
- Filter tabs: All / Upcoming / In Progress / Completed
- Tap any match → opens Match Detail screen (Module 5)

**Cache:** Store fixtures list in local DB (Hive/SQLite) for offline access.

---

### Screen: Bracket View (for knockout tournaments)
**Shown when league format is `single_elim` or `double_elim`**

**Display:**
- Visual bracket tree
- Each match node shows: team names, score (if played), winner highlighted
- For double elimination: show Winners bracket and Losers bracket as separate tabs
- Grand Final shown at the bottom / end
- Bye matches: show "BYE" in place of the missing team

**API response structure to render:**
```
// single_elim response
{
  "rounds": [
    {
      "round": 1,
      "matches": [
        {
          "match_id": "R1M1",
          "home": "t1", "away": null, "bye": true,
          "winner": "t1",
          "winner_to": { "match_id": "R2M1", "slot": "home" }
        },
        ...
      ]
    }
  ]
}

// double_elim response
{
  "winners": [ { "round": 1, "matches": [...] } ],
  "losers":  [ { "round": 1, "matches": [...] } ],
  "grand_final": [ { "match_id": "GF1", ... }, { "match_id": "GF2", "conditional": true } ]
}
```

**For Swiss format:**
- Show current round pairings
- Show standings below pairings (rank, team, score, buchholz)

---

### Screen: Round Robin Schedule
**Shown when format is `round_robin`**
- Group matches by round: "Round 1", "Round 2", etc.
- Show bye teams per round (if odd number of teams)
- Forfeited matches: show "W/O" (walkover) label
- Voided matches: show "VOID" with strikethrough styling

---

## Status Badge Colors (suggestion)
| Status | Color |
|--------|-------|
| Upcoming | Blue |
| In Progress | Green (pulsing) |
| Completed | Grey |
| Postponed | Orange |
| Abandoned | Red |
| Cancelled | Dark red with strikethrough |

---

## Role Visibility
| Role | Can See |
|------|---------|
| All roles | View fixtures and brackets |
| League Organizer | (Schedule management is backend-side; no extra UI needed for Day 1) |
