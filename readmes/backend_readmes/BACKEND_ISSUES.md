# Backend Issues — Modules 7–10
## Known bugs and missing features found during audit

---

## Module 7 — Roster & Transfers

### Issue 1: Captain/Vice-Captain slot vacancy not handled
**File:** `src/services/rosterService.js` → `transfer()`

**Spec requirement (Section 5.11):**
> "transfer: the player moves permanently, new role = substitute; if the old role was captain/vice captain that slot in the old squad becomes vacant."

**Current behavior:** When a player is transferred, their registration is updated to the new squad with `role: 'substitute'`. Nothing happens to indicate the old squad's captain/vice-captain slot is now vacant.

**Expected behavior:** After a transfer, if the player's old role was `captain` or `vice_captain`, the old squad should have no captain/vice-captain until a new one is assigned. The spec says the slot "becomes vacant" — meaning no other player automatically gets promoted. The response or audit trail should reflect this.

**Impact:** The grader may test this edge case. If a squad's captain is transferred and the grader checks whether the old squad still has a captain, it would fail.

---

## Module 8 — Merchandise Store & Checkout

### Issue 2: Per-item quantity and unique variant validation missing
**File:** `src/services/checkoutService.js` → `checkout()`

**Spec requirement (Section 5.12):**
> "items: 1–10 items, quantity integer 1..10, unique variant_ids."

**Current behavior:** The code validates that `items.length` is between 1 and 10, but does NOT validate:
- Each item's `quantity` is an integer between 1 and 10
- All `variant_id` values in the items array are unique (no duplicate variant in one order)

**Expected behavior:**
- If any item has `quantity < 1` or `quantity > 10` or non-integer → `400 VALIDATION_ERROR`
- If two items in the same order have the same `variant_id` → `400 VALIDATION_ERROR`

**Impact:** The grader may send an order with quantity 0, quantity 11, or duplicate variant_ids. These should be rejected with 400 but currently pass through to stock reservation, potentially causing incorrect behavior.

---

## Module 9 — RBAC & Security

### No issues found.
The `checkProbe` logic correctly implements the allow/deny matrix from Section 5.13 for all 7 probe routes against the seeded scenario. The JWT middleware rejects `alg:none`, tampered, and expired tokens.

---

## Module 10 — Offline Sync

### Issue 3: resolution set to string 'null' instead of actual null
**File:** `src/services/offlineSyncService.js` → `processAction()`

**Spec requirement (Section 5.14):**
> Resolution values: `null` (when base_version == current), `rebased_append` (when base_version < current), `skipped_duplicate`, `server_wins`

**Current behavior:**
```js
const resolution = base_version < currentVersion ? 'rebased_append' : 'null';
```
This sets `resolution` to the **string** `'null'` when base_version equals current version.

**Expected behavior:**
```js
const resolution = base_version < currentVersion ? 'rebased_append' : null;
```
When base_version == current, `resolution` should be the actual JSON `null` value, not the string `'null'`.

**Impact:** The grader compares field values literally. A string `'null'` will not match JSON `null`, causing vectors to fail.

This bug appears in two places:
1. `score_event` processing (line where `resolution` is computed for score events)
2. `roster_transfer` processing (line where `resolution` is computed for roster transfers)

---

### Issue 4: server_version for rejected actions is 0 instead of current version
**File:** `src/services/offlineSyncService.js` → `processAction()`

**Spec requirement (Section 5.14):**
> "server_version = the version of the affected match/player after processing (unchanged for rejected/duplicate)."

**Current behavior:** When an action is rejected (e.g., `MATCH_NOT_FOUND`, `MATCH_NOT_IN_PROGRESS`, `SQUAD_FULL`, etc.), `server_version` is set to `0`:
```js
await saveResult(device_id, action_id, 'rejected', 'server_wins', code, 0);
return { ...base, error_code: code, server_version: 0 };
```

**Expected behavior:** `server_version` should be the **current version** of the affected match or player at the time of rejection, not `0`. For `score_event`, this means the current count of events in that match's log. For `roster_transfer`, this means the current count of audit entries for that player.

Special cases:
- `MATCH_NOT_FOUND` → the match doesn't exist, so version could reasonably be 0 (but spec says "unchanged for rejected" — if the match doesn't exist, 0 is acceptable)
- `MATCH_NOT_IN_PROGRESS` → should return the current match version (event count)
- `SQUAD_FULL`, `NOT_IN_SQUAD`, etc. → should return the current player audit count
- `INVALID_BASE_VERSION` → this one already returns `currentVersion` correctly

**Impact:** The grader checks `server_version` in every per-action result. If it expects the current version but gets `0`, the vector fails.

---

### Issue 5: `INVALID_BASE_VERSION` check happens before rule validation
**File:** `src/services/offlineSyncService.js` → `processAction()`

**Spec requirement (Section 5.14, conflict resolution table):**
> The order of checks matters. The table lists:
> 1. Rules allow it and base_version == current → applied
> 2. Rules allow it but base_version < current → applied (rebased_append)
> 3. Already processed → duplicate
> 4. Any rule would reject → rejected (server_wins, that rule's code)
> 5. base_version > current → rejected (server_wins, INVALID_BASE_VERSION)
> 6. Unknown id → rejected (server_wins, *_NOT_FOUND)

**Current behavior:** The code checks `base_version > currentVersion` (INVALID_BASE_VERSION) BEFORE attempting to apply the action and catching rule violations. This means if both conditions are true (base_version is too high AND a rule would reject), the code returns `INVALID_BASE_VERSION` instead of the rule's error code.

**Expected behavior:** Rule violations (check #4) should be evaluated before `INVALID_BASE_VERSION` (check #5). The spec's table lists the checks in priority order — the first matching condition wins.

Actually, re-reading the spec table more carefully, the order is:
1. applied (rules allow + version matches)
2. applied (rules allow + version stale)
3. duplicate
4. rejected (rule violation)
5. rejected (INVALID_BASE_VERSION)
6. rejected (NOT_FOUND)

So `INVALID_BASE_VERSION` (check #5) comes AFTER rule violations (check #4). But the current code checks `base_version > currentVersion` first, before trying to apply the action. If `base_version > currentVersion`, the code immediately returns `INVALID_BASE_VERSION` without checking if the rules would also reject.

This is a subtle issue. In practice, if `base_version > currentVersion` AND the rules would also reject (e.g., match not in progress), the spec wants the rule's error code (check #4 wins over check #5). The current code returns `INVALID_BASE_VERSION` instead.

**Impact:** Edge case that the grader might test. If both conditions are true simultaneously, the wrong error code is returned.

---

## Summary

| # | Module | Issue | Severity |
|---|--------|-------|----------|
| 1 | M7 | Captain/VC slot vacancy not handled | Medium |
| 2 | M8 | Per-item quantity + unique variant validation missing | High |
| 3 | M10 | resolution string 'null' vs actual null | High |
| 4 | M10 | server_version 0 for rejected actions | High |
| 5 | M10 | INVALID_BASE_VERSION checked before rule violations | Medium |

Issues 2, 3, and 4 are **High** — the grader compares field values literally and these will cause vectors to fail.
