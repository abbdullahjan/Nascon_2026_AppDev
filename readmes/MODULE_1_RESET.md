# Module 1 — Reset & Baseline Seeding

## What the Backend Exposes
```
POST /audit/v1/reset
```
Wipes all data and re-seeds baseline state. Called by the grader before every test group.
No auth required.

---

## What You Build (Frontend)

**No dedicated screen needed.** The reset endpoint is for the grader and backend only.

However, you need to know what data exists after every reset so your app works from a clean state:

### Seeded Data (always available after reset)

**Sports:**
- `football`, `basketball`, `cricket`, `esports`

**Tenants:**
- `tenant-alpha` ("Alpha Sports")
- `tenant-beta` ("Beta Athletics")

**Store Products (tenant-alpha):**
- Product: `prod-jersey-001`
- Variants:
  - `var-jersey-001-M` — PKR 4500.00 (stock: 1 by default)
  - `var-jersey-001-L` — PKR 4500.00 (stock: 5 by default)
- Discount code: `WELCOME10` (10% off)

**Leagues:**
- `league-alpha-1`, `league-alpha-2` (tenant-alpha)
- `league-beta-1` (tenant-beta)

**Clubs:**
- `club-alpha-1`, `club-alpha-2` (tenant-alpha)
- `club-beta-1` (tenant-beta)

**Players:**
- `player-alpha-1` → `club-alpha-1`
- `player-alpha-2` → `club-alpha-2`
- `player-beta-1` → `club-beta-1`

**Demo accounts (always exist):**

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@nascon.test | Nascon@26 |
| League Organizer | organizer@nascon.test | Nascon@26 |
| Club Manager | manager@nascon.test | Nascon@26 |
| Player | player@nascon.test | Nascon@26 |
| Viewer | viewer@nascon.test | Nascon@26 |

---

## Developer Note
When testing locally, if the app shows no data or broken state — the backend dev will call
`POST /audit/v1/reset` to restore clean baseline. Your app should gracefully handle empty
lists with a "No data yet" message rather than crashing.
