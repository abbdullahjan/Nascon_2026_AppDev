# Module 4 — League Registration

## What the Backend Exposes
```
POST /audit/v1/leagues
```
Registers a league with teams, fixtures, points config, and qualification spots.

---

## What You Build

### Screen: League List
**Accessible from home / bottom nav for all roles**

**Display:**
- List of all leagues
- Each card shows:
  - League name / ID
  - Sport (icon + name)
  - Number of teams
  - Tenant name
- Tap → opens Standings screen (Module 6) for that league

---

### Screen: League Detail
**Shown when tapping a league from the list**

**Display:**
- League name, sport, tenant
- Points system: Win / Draw / Loss points
- Qualification spots (how many teams advance)
- List of registered teams
- Tab: Fixtures (links to Module 3)
- Tab: Standings (links to Module 6)

---

### Screen: Create League (League Organizer only)
**Only visible to League Organizer role**

**Form fields:**
- League ID (text)
- Sport (dropdown from available sports)
- Teams (multi-select or add by ID)
- Fixtures (can be generated via the fixtures endpoint and then submitted here)
- Points config: Win / Draw / Loss (number inputs, defaults 3/1/0)
- Tie-break order (drag-and-reorder list)
- Qualification spots (number)

**On submit:** `POST /audit/v1/leagues`

**Success:** Show "League created" snackbar, navigate to the new league's detail screen.

**Errors to handle:**
| Error code | User message |
|------------|--------------|
| `SPORT_NOT_FOUND` | "Selected sport does not exist" |
| `LEAGUE_EXISTS` | "A league with this ID already exists" |
| `MATCH_EXISTS` | "One of the fixture IDs is already in use" |
| `VALIDATION_ERROR` | Show per-field errors from `details.fields` |

---

## Role Visibility
| Role | Can See / Do |
|------|-------------|
| All roles | View league list and detail |
| League Organizer | Create league (own tenant only) |
| Others | Read-only |
