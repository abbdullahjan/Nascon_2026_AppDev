"""
smoke.py — Basic smoke tests for the NaSCon '26 backend API.
Run after `docker compose up -d --build` and a successful /health check.

Usage:
    python tests/smoke.py
"""
import sys
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8080"


def get(path):
    url = BASE + path
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.status, json.loads(r.read())


def post(path, body=None):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}  {detail}")
        failed += 1


print("\n=== NaSCon '26 Smoke Tests ===\n")

# 1. Health
status, body = get("/health")
check("GET /health → 200 {status:ok}", status == 200 and body.get("status") == "ok", body)

# 2. Reset
status, body = post("/audit/v1/reset", {"seed": 42})
check("POST /audit/v1/reset → 200", status == 200, body)
check("reset returns status=reset_complete", body.get("status") == "reset_complete", body)
check("reset lists 4 sports", len(body.get("sports", [])) == 4, body)

# 3. Sports — mystery sport
mystery = {
    "sport_id": "smoke_sport",
    "name": "Smoke Sport",
    "scoring_model": "event",
    "periods": {"count": 2, "duration_minutes": 10},
    "scoring_events": {"point": {"points": 1}},
    "draw_allowed": False,
    "overtime": {"policy": "none"},
    "roster": {"min_squad_size": 2, "max_squad_size": 5, "required_positions": {}},
}
status, body = post("/audit/v1/sports", mystery)
check("POST /audit/v1/sports → 201", status == 201, body)

# 4. Rate-limit probe
status, body = get("/api/v1/ping")
check("GET /api/v1/ping → 200 {pong:true}", status == 200 and body.get("pong") is True, body)

# 5. Payload too large
big = "x" * (1024 * 1024 + 1)
status, body = post("/audit/v1/reset", {"junk": big})
check("POST >1MB → 413", status == 413, body)

print(f"\nResults: {passed} passed, {failed} failed")
if failed:
    sys.exit(1)
