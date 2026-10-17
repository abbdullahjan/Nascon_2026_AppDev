# Module 6 — Standings Engine

## What the Backend Exposes
```
GET /audit/v1/standings/{league_id}
```
Returns the full points table with H2H matrix and qualification status.
Recomputed from scratch on every call.

---

## What You Build

### Screen: Standings / Points Table
**Accessible from League Detail → Standings tab, or from bottom nav**

#### Points Table
Display a scrollable table with these columns:

| Column | Field | Notes |
|--------|-------|-------|
| Rank | `rank` | Bold number |
| Team | `team_id` | Team name/logo |
| P | `played` | Matches played |
| W | `won` | |
| D | `drawn` | Hide for sports with `draw_allowed: false` |
| L | `lost` | |
| GF/PF | `scored` | Goals/Points/Runs For (label changes by sport) |
| GA/PA | `conceded` | Goals/Points/Runs Against |
| GD/NRR | `diff` | Differential (for cricket: Net Run Rate, 3 decimals) |
| Pts | `points` | **Bold, prominent** |
| Status | `status` | Qualification badge |

#### Qualification Status Badges
| Status | Display |
|--------|---------|
| `clinched` | Green checkmark badge "Q" |
| `eliminated` | Red "E" badge |
| `still_possible` | No badge or grey dot |

#### Tie-break indicator
- If `resolved_by` is not null, show a small info icon on that row
- Tooltip/tap: "Ranked by: Head-to-Head Points" etc.

---

### Section: Head-to-Head Matrix
- Show below the main table (expandable / separate tab)
- Grid where rows = teams, columns = teams
- Each cell shows: W-D-L record of row team against column team
- Diagonal cells: "-"

**API response:**
```json
"h2h": {
  "t1": {
    "t2": { "played": 1, "points": 3, "scored": 2, "conceded": 1 }
  }
}
```

---

### Sport-Specific Display Adjustments

| Sport | Diff column label | Draw column |
|-------|-------------------|-------------|
| football | GD (Goal Diff) | Show |
| basketball | PD (Point Diff) | Hide |
| cricket | NRR (Net Run Rate) | Show |
| esports | Map Diff | Hide |

---

## Role Visibility
| Role | Can See / Do |
|------|-------------|
| All roles | View standings table |
| No role | Can edit standings (auto-computed by backend) |

---

## Caching for Offline
- Cache the last-fetched standings in local DB per league
- Show cached data when offline with "Offline — last updated X" label
