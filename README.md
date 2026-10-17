# NaSCon '26 — Multi-Sport League & Club Operations Platform

Full-stack platform for multi-tenant sports league management, fixture scheduling,
event-sourced scoring, roster operations, and a concurrency-safe merchandise store.

---

## Quick Start

### Linux / macOS
```sh
DAY1_SALT=<your-salt> docker compose up -d --build
```

### Windows (PowerShell)
```powershell
$env:DAY1_SALT="<your-salt>"; docker compose up -d --build
```

> The salt is printed on your team's slip. It is **never** committed to the repo.
> Copy `.env.example` to `.env` and set `DAY1_SALT` there for repeated local runs.

The build downloads nothing at runtime. On a clean machine the full stack
(API + PostgreSQL + Redis) is up and `/health` returns `{"status":"ok"}`
within 120 seconds.

---

## Health Check

```sh
curl http://localhost:8080/health
# {"status":"ok"}
```

---

## Run Tests

```sh
./run_tests.sh
```

This runs the backend Jest test suite inside the `backend/` directory.
For the smoke tests (requires a running stack):

```sh
python tests/smoke.py
```

---

## Mobile App

The Flutter app lives in `mobile/`. The built APK is at
`mobile/release/app-release.apk` (Android 10 / API 29+).

The server address is configurable in the app's **Settings** screen:

| Environment | Address |
|---|---|
| Android emulator | `http://10.0.2.2:8080` |
| Physical phone (same LAN) | `http://<laptop-LAN-IP>:8080` |

---

## Demo Accounts

All accounts use password **`Nascon@26`**.

| Role | Email |
|---|---|
| Platform Super-Admin | admin@nascon.test |
| League Organizer (owns `league-alpha-1`) | organizer@nascon.test |
| Club Manager (owns `club-alpha-1`) | manager@nascon.test |
| Player (`player-alpha-1`) | player@nascon.test |
| General Viewer | viewer@nascon.test |

These accounts are created automatically on every `docker compose up` and on
every `POST /audit/v1/reset`.

---

## Stack

| Service | Image | Host port |
|---|---|---|
| API | `nascon-26-api` (built from `backend/`) | 8080 |
| PostgreSQL | `postgres:16-alpine` | internal |
| Redis | `redis:7-alpine` | internal |

---

## Repo Structure

```
docker-compose.yml      — brings up the full backend stack
.env.example            — copy to .env and set DAY1_SALT
README.md               — this file
TRACEABILITY.md         — FR/NFR → source file mapping
COVERAGE.json           — line-coverage percentages per area
run_tests.sh            — runs backend/run_tests.sh
tests/smoke.py          — API smoke tests (needs running stack)
backend/                — Node.js / Fastify API
mobile/                 — Flutter mobile app
  release/app-release.apk  — built APK (Android)
readmes/                — detailed module documentation
```
