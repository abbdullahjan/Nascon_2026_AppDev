# Module 10 — Offline Sync

## What the Backend Exposes
```
POST /audit/v1/offline-sync
```
Replays a batch of actions the mobile app queued while offline.
Always returns HTTP 200 — conflicts are reported per action inside the response.

---

## What You Build

### This is the most important mobile feature for the competition judging.
The judge will put the phone in airplane mode and perform actions. Those actions must:
1. Be stored locally (persistent — survives app restart)
2. Show as "pending" in the UI
3. Auto-sync when network returns
4. Show per-action results (applied / rejected + reason)

---

### Always-Visible Sync Status Bar
**Shown on every screen — never hidden**

Display a small bar or chip at the top/bottom of every screen:

| State | Display |
|-------|---------|
| Online, no pending actions | Green dot + "Online" |
| Online, syncing | Spinning icon + "Syncing..." |
| Online, sync complete | Green + "All synced" |
| Offline, no pending | Orange dot + "Offline" |
| Offline, N pending actions | Orange + "Offline — 3 pending" |

Tapping the bar opens the Pending Queue screen.

---

### Pending Queue Screen
**Opened from the sync status bar**

**Display:**
- List of all queued (unsynced) actions
- Each action card:
  - Action type: "Score Event" or "Roster Transfer"
  - Time queued (relative: "2 minutes ago")
  - Status: Pending / Synced / Failed
  - For failed: reason in plain English (not error codes)
  - For synced: "Applied ✓" or "Rejected: [plain reason]"
- "Sync Now" button (manual trigger)
- Pull-to-refresh

**After sync completes:**
- Applied actions: show green "Applied ✓"
- Rejected actions: show red "Rejected" + plain language reason
- Duplicates: show grey "Already processed"
- Clear successfully applied actions after a few seconds (or keep history)

---

### How to Queue Actions (Local Storage Format)

When the user is offline and performs a scoring or roster action,
**do not call the API**. Instead save to local DB (Hive/SQLite):

```dart
// Action format to store locally
{
  "action_id": "a_<uuid>",            // generate a UUID
  "type": "score_event",              // or "roster_transfer"
  "queued_at": "2026-10-17T11:00:00Z", // current UTC time
  "base_version": 3,                  // current match version you last saw
  "payload": {
    // For score_event: the full /audit/v1/events request body
    "event_id": "evt-<uuid>",
    "match_id": "m1",
    "type": "score",
    "payload": { "team_id": "t1", "event_type": "goal" }
  }
}

// For roster_transfer:
{
  "action_id": "a_<uuid>",
  "type": "roster_transfer",
  "queued_at": "2026-10-17T11:01:00Z",
  "base_version": 1,                  // number of audit entries for this player
  "payload": {
    // the full /audit/v1/roster/transfer request body
    "request_id": "tr-<uuid>",
    "league_id": "lg-r1",
    "player_id": "p2",
    "type": "transfer",
    ...
  }
}
```

**Key rule:** Generate `action_id`, `event_id`, `request_id` as UUIDs locally when queuing.
Use the `base_version` from the last known state of that match/player.

---

### Sync Logic (what to do when network returns)

1. Detect network restored (use `connectivity_plus` package)
2. Read all pending actions from local DB
3. Send to `POST /audit/v1/offline-sync`:

```json
{
  "device_id": "dev-<unique device id>",
  "actions": [ ...all pending actions... ]
}
```

4. Parse response — per action:

```json
{
  "results": [
    {
      "action_id": "a1",
      "status": "applied",
      "resolution": "rebased_append",
      "error_code": null,
      "processed_order": 1,
      "server_version": 5,
      "signature": "<hex>"
    },
    {
      "action_id": "a2",
      "status": "rejected",
      "resolution": "server_wins",
      "error_code": "SQUAD_FULL",
      "processed_order": 2,
      "server_version": 1,
      "signature": null
    }
  ],
  "summary": { "applied": 1, "rejected": 1, "duplicate": 0 }
}
```

5. Update local DB for each action based on result
6. Show results in the Pending Queue screen

---

### Resolution → User-Friendly Messages

| resolution | error_code | Message to show user |
|------------|-----------|----------------------|
| `null` (applied) | null | "Synced successfully ✓" |
| `rebased_append` | null | "Synced (updated to latest version) ✓" |
| `skipped_duplicate` | null | "Already processed — no changes made" |
| `server_wins` | `SQUAD_FULL` | "Rejected: Squad is at maximum capacity" |
| `server_wins` | `NOT_IN_SQUAD` | "Rejected: Player is no longer in this squad" |
| `server_wins` | `MATCH_NOT_IN_PROGRESS` | "Rejected: Match is no longer in progress" |
| `server_wins` | `INVALID_COMPENSATION` | "Rejected: Event has already been overturned" |
| `server_wins` | `TRANSFER_WINDOW_CLOSED` | "Rejected: Transfer window has closed" |
| `server_wins` | `INVALID_BASE_VERSION` | "Rejected: Data conflict with server" |
| `server_wins` | `*_NOT_FOUND` | "Rejected: Match / player / squad no longer exists" |

**Never show raw error codes to the user.**

---

### Offline Screens (Cached Data)
These screens must work offline (show cached data):

| Screen | Cache in local DB |
|--------|------------------|
| Fixtures | Yes — cache list per league |
| Match Detail | Yes — cache last score + events |
| Standings | Yes — cache per league |
| Club Profile | Yes — cache club + roster |

Show "Offline — viewing cached data" banner on these screens when offline.
Show "Last updated: [time]" so user knows how fresh the data is.

---

### Packages to Add
```yaml
connectivity_plus: ^6.x    # detect online/offline
uuid: ^4.x                  # generate action/event IDs
```

---

### Judge Test Checklist (what the judge does)
1. Opens Fixtures, Standings, Club Profile online → your app caches them
2. Switches to airplane mode → cached screens still open, "Offline" indicator shows
3. Records a score event as Organizer → stored in queue, shows "pending"
4. Does a roster action as Manager → stored in queue, shows "pending"
5. Force-closes and reopens app → pending actions still there (persistent queue)
6. Turns network back on → app auto-syncs, shows results per action, clears queue

**If any of these 6 steps fail, you lose offline points. Prioritize this.**
