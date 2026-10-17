# Module 7 — Roster & Transfers

## What the Backend Exposes
```
POST /audit/v1/roster/setup        — create a roster scenario (admin/organizer)
POST /audit/v1/roster/transfer     — transfer / loan / release a player
GET  /audit/v1/roster/history/{player_id}?as_of=YYYY-MM-DD  — player audit trail
```

---

## What You Build

### Screen: Club Profile
**Accessible from bottom nav, or tapping a club anywhere in the app**

**Sections:**

#### Club Header
- Club logo, name
- Home venue (show on map or as text coordinates)
- Social handles (Twitter, Instagram, etc.)
- Tenant name (Alpha Sports / Beta Athletics)

#### Active Roster Tab
- List of all players in the squad
- Each player card:
  - Name
  - Position (GK, DF, MF, FW, etc.)
  - Role badge: Captain ©, Vice-Captain (VC), Starter, Substitute
  - Loan indicator: "On Loan from [Club]" or "Loaned to [Club]"
- Show total squad count vs max allowed

#### Staff Tab
- Coach, Manager, Physio cards (name + role)

#### Stats Tab
- Historical statistics across seasons (wins, losses, goals, etc.)
- (Can be simple for Day 1 — just show current season)

---

### Screen: Roster Management (Club Manager only)
**Only visible to Club Manager role — accessed from Club Profile**

#### Player List with Actions
- Each player has a context menu or action buttons:
  - **Transfer** (move permanently to another squad)
  - **Loan** (temporary move with end date)
  - **Release** (remove from league)

#### Transfer / Loan Form (bottom sheet)
For **Transfer:**
- Player name (pre-filled, read-only)
- Destination squad (dropdown of squads in same tenant)
- Effective date (date picker)
- Reason (text field)

For **Loan:**
- Same as Transfer +
- Loan end date (date picker, must be after effective date)

For **Release:**
- Player name (pre-filled)
- Effective date
- Reason
- Confirmation dialog: "Are you sure you want to release [Player Name]?"

**On submit:** `POST /audit/v1/roster/transfer`

#### State indicators
- If response `state: "deferred_until_match_end"` → show yellow banner:
  "Transfer accepted but deferred — player is currently in a live match"
- If `state: "active"` → show green snackbar: "Transfer complete"

**Errors to handle (in order):**
| Error code | User message |
|------------|--------------|
| `VALIDATION_ERROR` | Show field-level errors |
| `LEAGUE_NOT_FOUND` | "League not found" |
| `PLAYER_NOT_FOUND` | "Player not found" |
| `SQUAD_NOT_FOUND` | "Squad not found" |
| `CROSS_TENANT_TRANSFER` | "Cannot transfer across tenants" |
| `NOT_IN_SQUAD` | "Player is not in the selected squad" |
| `TRANSFER_WINDOW_CLOSED` | "Transfer window is currently closed" |
| `PLAYER_ON_LOAN` | "Player is currently on loan and cannot be transferred" |
| `SQUAD_FULL` | "Destination squad is at maximum capacity" |
| `MIN_POSITION_VIOLATION` | "Transfer would leave the squad without required positions" |

---

### Screen: Player Profile / History
**Accessible by tapping a player from the roster**

**Display:**
- Player name, position, current role
- Current squad
- If on loan: loan details (from squad, to squad, end date)

#### Transfer History Tab
- Chronological list from `GET /audit/v1/roster/history/{player_id}`
- Each entry:
  - Action type: Transfer / Loan / Release / Loan Return
  - From squad → To squad
  - Date
  - Requested by
  - Reason
- Loan return entries show "Auto-returned by system"
- `as_of` date: default today, but allow a date picker to view historical state

---

## Role Visibility
| Role | Can See / Do |
|------|-------------|
| All roles | View club profile and roster |
| Club Manager | Transfer, loan, release players (own club only) |
| Player | View own profile and history |
| Others | Read-only |

---

## Caching for Offline
- Cache club profile and roster in local DB
- Offline roster actions (transfer/loan/release) go into the pending queue (Module 10)
