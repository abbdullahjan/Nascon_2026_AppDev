# NaSCon '26 — Frontend Developer Guide
## Master Overview

This folder contains screen-by-screen implementation guides for every module in the app.
The backend API runs on `http://localhost:8080` (emulator: `http://10.0.2.2:8080`).
The server address must be configurable inside the app (settings screen or build config).

---

## Tech Stack (Your Choice)
- Flutter (recommended — already in this repo)
- State management: Provider / Riverpod / Bloc — your call
- Local DB: **Hive or SQLite (Drift)** — mandatory for offline support
- Secure storage: **Flutter Secure Storage** (backed by Android Keystore / iOS Keychain)
- HTTP: **Dio** (interceptors make auth easy)
- WebSocket/SSE: for real-time score updates

---

## Module Map → Screen Map

| Module | What Backend Exposes | Screens You Build |
|--------|----------------------|-------------------|
| M0 | `/health` | Splash / connection check |
| M1 | `/audit/v1/reset` | (internal, no screen needed) |
| M2 | `/audit/v1/sports` | (no dedicated screen) |
| M3 | `/audit/v1/fixtures` | Fixtures list, Bracket view |
| M4 | `/audit/v1/leagues` | League setup (organizer) |
| M5 | `/audit/v1/events`, `/score` | Match detail, Score entry |
| M6 | `/audit/v1/standings` | Standings / points table |
| M7 | `/audit/v1/roster/*` | Club profile, Roster management |
| M8 | `/audit/v1/checkout`, `/inventory` | Store, Cart, Checkout, Receipt |
| M9 | `/audit/v1/rbac-matrix`, `/api/v1/ping` | Login, Role-aware navigation |
| M10 | `/audit/v1/offline-sync` | Sync status bar, Pending queue |

---

## Required Screens (from spec Section 8.2)

| Screen | Required |
|--------|----------|
| Login | Email + password, role-aware home after login |
| Fixtures | List of matches with status and time, tap to open |
| Match Detail | Live score (real-time), event timeline, pinned product |
| Standings | Points table with qualification status |
| Club Profile | Club info, roster, staff, home venue |
| Store | Catalogue, variant picker, cart, checkout, receipt |
| Roster Management | Club Manager: add/transfer/loan/release |
| Scoring Entry | League Organizer: append score event + compensating event |
| Sync Status | Always-visible online/offline/syncing indicator + pending queue |

---

## Demo Accounts (exist after every app start)

| Role | Email | Password |
|------|-------|----------|
| Platform Super-Admin | admin@nascon.test | Nascon@26 |
| League Organizer | organizer@nascon.test | Nascon@26 |
| Club Manager | manager@nascon.test | Nascon@26 |
| Player | player@nascon.test | Nascon@26 |
| General Viewer | viewer@nascon.test | Nascon@26 |

---

## Auth Flow
1. POST to `/audit/v1/rbac-matrix` returns JWTs for all 5 roles.
2. For login: call your backend login endpoint with email+password → get JWT back.
3. Store JWT in **Flutter Secure Storage** (never SharedPreferences).
4. Attach to every request: `Authorization: Bearer <jwt>`
5. If 401 received → clear token → redirect to Login screen.

---

## Global API Rules
- All bodies: `Content-Type: application/json`, UTF-8
- Timestamps: `YYYY-MM-DDTHH:MM:SSZ` (ISO 8601 UTC)
- Money: integers in minor units (paisa). `450000` = PKR 4500.00
- Unknown fields in responses: ignore them safely
- On any non-2xx: parse `error.code` and `error.message` — show `message` to user, never raw codes

---

## Read Each Module README
- [Module 0 — App Foundation & Health](./MODULE_0_FOUNDATION.md)
- [Module 1 — Reset & Seeding](./MODULE_1_RESET.md)
- [Module 2 — Sports](./MODULE_2_SPORTS.md)
- [Module 3 — Fixtures & Brackets](./MODULE_3_FIXTURES.md)
- [Module 4 — League Registration](./MODULE_4_LEAGUES.md)
- [Module 5 — Event Sourced Scoring](./MODULE_5_EVENTS.md)
- [Module 6 — Standings Engine](./MODULE_6_STANDINGS.md)
- [Module 7 — Roster & Transfers](./MODULE_7_ROSTER.md)
- [Module 8 — Merchandise Store & Checkout](./MODULE_8_STORE.md)
- [Module 9 — RBAC, Auth & Security](./MODULE_9_RBAC.md)
- [Module 10 — Offline Sync](./MODULE_10_OFFLINE_SYNC.md)
