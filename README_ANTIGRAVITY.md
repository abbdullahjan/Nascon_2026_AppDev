# README — ANTIGRAVITY (QA / Testing Agent)

> **STRICT RULE: You are READ-ONLY. You may NOT edit, create, delete, or modify any source file, migration, test file, config file, or any other file in this repository. Your only job is to run curl commands and report results. If you find a bug, report it clearly — do not fix it yourself. Ahmed will fix it.**

---

## Your Role

You are the live QA agent. The backend is running at `http://172.15.33.234:8080`.
Ahmed is coding. You test what he builds, report what passes and what fails, and nothing else.

---

## Backend Address

```
BASE_URL = http://172.15.33.234:8080
```

All curl commands below use this base. Run them exactly as written.

---

## Test Suite — Run in Order

### 0. Seed the database first (ALWAYS run this before any other test)

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/reset \
  -H "Content-Type: application/json" \
  -d '{}' | python -m json.tool
```

**Expected:** `200 OK`, body contains `"status": "reset_complete"`, `"phase2"` object with `match-m1`, `guest_anon_tok_7721`, QR mappings.

---

### 1. Health check

```bash
curl -s http://172.15.33.234:8080/health | python -m json.tool
```

**Expected:** `200 OK`, `{"status": "ok"}`

---

### 2. Prometheus metrics

```bash
curl -s http://172.15.33.234:8080/metrics
```

**Expected:** `200 OK`, Content-Type `text/plain; version=0.0.4`, body contains ALL 5 lines:
- `nascon_active_ws_connections`
- `nascon_active_streams_total`
- `nascon_stream_bitrate_kbps`
- `nascon_dlq_depth`
- `nascon_qr_scans_total`

---

### 3. Stream key — generate

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/stream/key \
  -H "Content-Type: application/json" \
  -d '{"action":"generate","player_id":"player-alpha-1","label":"OBS-Main"}' \
  | python -m json.tool
```

**Expected:** `201 Created`, fields: `player_id`, `label`, `stream_key` matching `^sk_live_[a-f0-9]{16}$`, `status: "active"`, `ingest_endpoints.rtmp`, `ingest_endpoints.webrtc`, `playback_url`, `signature` (64-char hex).

---

### 4. Stream key — rotate with override (deterministic signature test)

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/stream/key \
  -H "Content-Type: application/json" \
  -d '{"action":"rotate","player_id":"player-alpha-1","stream_key_override":"sk_live_9f83a1b2c3d4e5f6"}' \
  | python -m json.tool
```

**Expected:** `200 OK`, `stream_key: "sk_live_9f83a1b2c3d4e5f6"`, `status: "active"`, `signature` must equal exactly:
```
9bd054eb746844b4701c6f158209c315ef2b16f392efd733bdf0715940610289
```
(only matches if `DAY2_SALT=T15D2c8dbe39f8bf` — if signature differs, check the salt).

---

### 5. Stream key — revoke

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/stream/key \
  -H "Content-Type: application/json" \
  -d '{"action":"revoke","player_id":"player-alpha-1"}' \
  | python -m json.tool
```

**Expected:** `200 OK`, `status: "revoked"`, `ingest_endpoints: null`, `playback_url: null`, `signature` 64-char hex.

---

### 6. Stream key — revoke with no active key → 404

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/stream/key \
  -H "Content-Type: application/json" \
  -d '{"action":"revoke","player_id":"player-alpha-1"}' \
  | python -m json.tool
```

**Expected:** `404`, `error.code: "STREAM_NOT_FOUND"`.

---

### 7. Stream key — unknown player → 404

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/stream/key \
  -H "Content-Type: application/json" \
  -d '{"action":"generate","player_id":"player-ghost-99"}' \
  | python -m json.tool
```

**Expected:** `404`, `error.code: "PLAYER_NOT_FOUND"`.

---

### 8. Stream key — bad action → 400

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/stream/key \
  -H "Content-Type: application/json" \
  -d '{"action":"destroy","player_id":"player-alpha-1"}' \
  | python -m json.tool
```

**Expected:** `400`, `error.code: "VALIDATION_ERROR"`, `details.fields` contains `"action"`.

---

### 9. Co-stream session — normal (no host drop)

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/costream/session \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "cs-session-101",
    "host_player_id": "player-alpha-1",
    "participants": ["player-alpha-1","player-alpha-2","player-beta-1","player-beta-2"],
    "layout": "grid_4",
    "simulate_host_drop": false
  }' | python -m json.tool
```

**Expected:** `201 Created`, `active_host: "player-alpha-1"`, `handoff_occurred: false`, `participant_count: 4`, `chat_room_id: "chat-cs-session-101"`, `composite_playback_url` contains `cs-session-101`, `signature` 64-char hex.

---

### 10. Co-stream session — host drop (4-way → 3)

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/costream/session \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "cs-session-102",
    "host_player_id": "player-alpha-1",
    "participants": ["player-alpha-1","player-alpha-2","player-beta-1","player-beta-2"],
    "layout": "grid_4",
    "simulate_host_drop": true
  }' | python -m json.tool
```

**Expected:** `201`, `active_host: "player-alpha-2"`, `handoff_occurred: true`, `participant_count: 3`, `active_participants: ["player-alpha-2","player-beta-1","player-beta-2"]`, `status: "active"`.

---

### 11. Co-stream session — sole host drops → terminated

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/costream/session \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "cs-session-103",
    "host_player_id": "player-alpha-1",
    "participants": ["player-alpha-1"],
    "layout": "grid_4",
    "simulate_host_drop": true
  }' | python -m json.tool
```

**Expected:** `201`, `active_host: null`, `handoff_occurred: false`, `participant_count: 0`, `status: "terminated"`.

---

### 12. Co-stream — idempotent replay → 200

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/costream/session \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "cs-session-101",
    "host_player_id": "player-alpha-1",
    "participants": ["player-alpha-1","player-alpha-2","player-beta-1","player-beta-2"],
    "layout": "grid_4",
    "simulate_host_drop": false
  }' | python -m json.tool
```

**Expected:** `200 OK` (not 201), same data as test 9.

---

### 13. Co-stream — >4 participants → 409

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/costream/session \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "cs-session-overflow",
    "host_player_id": "player-alpha-1",
    "participants": ["player-alpha-1","player-alpha-2","player-beta-1","player-beta-2","player-alpha-1"],
    "layout": "grid_4"
  }' | python -m json.tool
```

**Expected:** `400` VALIDATION_ERROR (duplicate participants) OR `409 COSTREAM_SESSION_FULL` if 5 unique IDs used.

---

### 14. Guest write guard — events endpoint

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/events \
  -H "Authorization: Bearer guest_anon_tok_7721" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"g1","match_id":"match-m1","type":"score","payload":{}}' \
  | python -m json.tool
```

**Expected:** `403`, `error.code: "GUEST_WRITE_FORBIDDEN"`.

---

### 15. Guest write guard — checkout endpoint

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/checkout \
  -H "Authorization: Bearer guest_anon_tok_7721" \
  -H "Content-Type: application/json" \
  -d '{}' | python -m json.tool
```

**Expected:** `403`, `error.code: "GUEST_WRITE_FORBIDDEN"`.

---

### 16. POST a real score event (triggers WS/SSE broadcast)

```bash
curl -s -X POST http://172.15.33.234:8080/audit/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "live-test-goal-1",
    "match_id": "match-m1",
    "type": "score",
    "payload": {"team_id": "club-alpha-1", "event_type": "goal"}
  }' | python -m json.tool
```

**Expected:** `201 Created`, fields: `event_id`, `match_id`, `type`, `sequence`, `match_version`, `signature` (64-char hex).

---

### 17. SSE stream — check it opens (run in background, Ctrl-C after 3 seconds)

```bash
curl -s -N http://172.15.33.234:8080/api/v1/matches/match-m1/stream
```

**Expected:** Response starts with `data: {"type":"connected","match_id":"match-m1"}` followed by `: ping` lines every 15 s. Must NOT return 404 or 500.

---

### 18. MediaMTX auth hook — publish allowed

```bash
curl -s -X POST http://172.15.33.234:8080/internal/mediamtx/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"publish","path":"sk_live_9f83a1b2c3d4e5f6"}' \
  | python -m json.tool
```

Run this AFTER test 4 (rotate with override), before test 5 (revoke).
**Expected:** `200 OK`, `{"result": "allow"}`.

---

### 19. MediaMTX auth hook — publish denied (revoked key)

Run AFTER test 5 (revoke).

```bash
curl -s -X POST http://172.15.33.234:8080/internal/mediamtx/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"publish","path":"sk_live_9f83a1b2c3d4e5f6"}' \
  | python -m json.tool
```

**Expected:** `401`, `{"result": "deny"}`.

---

### 20. MediaMTX auth hook — read always allowed

```bash
curl -s -X POST http://172.15.33.234:8080/internal/mediamtx/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"read","path":"sk_live_9f83a1b2c3d4e5f6"}' \
  | python -m json.tool
```

**Expected:** `200 OK`, `{"result": "allow"}`.

---

## How to Report Results

For each test, report in this format:

```
Test N — [PASS / FAIL]
Status: <actual HTTP status>
Expected: <what spec says>
Body snippet: <first 200 chars of response>
Issue (if FAIL): <what is wrong>
```

Do NOT attempt to fix anything. Hand the failure report to Ahmed.

---

## What You Must NEVER Do

- Edit any `.js`, `.ts`, `.py`, `.json`, `.yml`, `.yaml`, `.md`, `.xml`, or any other file
- Run `npm install`, `git commit`, `git push`, or any write command
- Modify `.env`, `docker-compose.yml`, or any config
- Create new files of any kind
- Change migration files, test files, or source code
- Restart containers or run `docker compose`

Your only permitted actions: `curl`, `python -m json.tool`, reading this README.
