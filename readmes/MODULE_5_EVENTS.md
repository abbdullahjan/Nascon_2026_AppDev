# Module 5 — Event-Sourced Scoring Engine

## What the Backend Exposes
```
POST /audit/v1/events       — append a match event
GET  /audit/v1/score/{match_id}  — get current score (rebuilt from event log)
```

---

## What You Build

### Screen: Match Detail
**Opened by tapping any match from Fixtures list**

**Display sections:**

#### Header
- Home team name + logo vs Away team name + logo
- Current score (large, prominent)
  - Event model: `2 — 1`
  - Innings model: `145/3 (16.2 ov) — 132/10 (20.0 ov)`
  - Round model: `2 — 1` (maps won)
- Match status badge (Upcoming / In Progress / Completed)
- Sport name

#### Score API response fields to display
```json
{
  "home": {
    "team_id": "t1",
    "score": 2,
    "wickets": null,
    "balls": null,
    "overs": null,
    "fair_play": 0
  },
  "away": { ... },
  "status": "completed",
  "outcome": "home_win"
}
```
- Show `wickets`, `overs` only for cricket (`scoring_model: innings`)
- Show `fair_play` as a small badge (yellow card count equivalent)
- `outcome`: display as "Home Win" / "Away Win" / "Draw" / "Undecided"

#### Event Timeline
- Chronological list of all events
- Each event row:
  - Sequence number
  - Event type icon (goal ⚽, basket 🏀, wicket 🏏, etc.)
  - Team name
  - Event type label (from sport config — not hardcoded)
  - Compensated events: show with strikethrough + "Overturned" label
  - Compensation events: show as "Correction" in grey

#### Pinned Product Showcase
- If a product is pinned to this match, show a small product card at the bottom
- Tapping it opens the Store screen (Module 8) on that product
- This updates in real time (WebSocket/SSE)

#### Real-Time Updates
- Connect to a WebSocket or SSE endpoint when match is `in_progress`
- Update score and event timeline automatically when new events arrive
- Show "LIVE" badge when connected and match is in progress

---

### Screen: Score Entry (League Organizer only)
**A bottom sheet or separate screen, accessible from Match Detail**

**Only shown when:** user role is League Organizer AND match status allows it.

#### Match Controls
Show buttons based on current match status:

| Current Status | Available Actions |
|----------------|------------------|
| Upcoming | "Start Match" button |
| In Progress | Score event form + "End Match" button |
| Completed | "Add Compensation" button only |

#### Score Event Form (shown when In Progress)
- Team selector: Home / Away (radio or segmented button)
- Event type dropdown: populated from sport's `scoring_events` config (fetched from backend)
  - e.g. for football: "Goal", for basketball: "Free Throw / Two Pointer / Three Pointer"
- Submit button: "Record Event"

#### Compensating Event Form
- Shows existing events as a list
- Tap an event → confirm "Overturn this event?" dialog
- On confirm → send compensation event
- Show reason text field (optional)

#### Event Types per Seeded Sport
| Sport | Event types |
|-------|-------------|
| football | goal |
| basketball | free_throw, two_pointer, three_pointer |
| cricket | dot_ball, single, two, four, six, wide, no_ball, wicket |
| esports | round_win |

**Important:** Never hardcode these. Always fetch from sport config.

**Errors to handle:**
| Error code | User message |
|------------|--------------|
| `ILLEGAL_TRANSITION` | "Cannot start/end match in current state" |
| `MATCH_NOT_IN_PROGRESS` | "Match is not currently in progress" |
| `UNKNOWN_EVENT_TYPE` | "Invalid event type for this sport" |
| `INNINGS_COMPLETE` | "This team's innings is already complete" |
| `SERIES_ALREADY_DECIDED` | "Series winner already determined" |
| `TIE_NOT_ALLOWED` | "This sport does not allow draws — cannot end match" |
| `INVALID_COMPENSATION` | "This event cannot be overturned" |

---

## Role Visibility
| Role | Can See / Do |
|------|-------------|
| All roles | View match detail and event timeline |
| League Organizer | Start match, record events, end match, compensate events |
| Others | Read-only |

---

## Caching for Offline
- Cache the last-fetched score and event list in local DB
- Offline: show cached data with "Last updated X minutes ago" label
- Offline scoring actions go into the pending queue (Module 10)
