# QR Deep-Link Integration Guide (Flutter)

## Base URL
- Web / Chrome: `http://localhost:8080`
- Android emulator: `http://10.0.2.2:8080`

---

## GET /audit/v1/qr/{entity_id}

Resolve QR metadata. Pass `?inspect=true` to skip scan_count increment.

**Headers:** none required (public)

**Request:**
```
GET /audit/v1/qr/match-m1
```

**Success 200:**
```json
{
  "entity_id": "match-m1",
  "entity_type": "match",
  "entity_status": "in_progress",
  "short_url": "http://localhost:8080/q/m1-live",
  "target_route": "/web/matches/match-m1/live",
  "deep_link_uri": "nascon://entity/match-m1",
  "scan_count": 1,
  "export_formats": {
    "svg": "http://localhost:8080/audit/v1/qr/match-m1/export.svg",
    "png": "http://localhost:8080/audit/v1/qr/match-m1/export.png",
    "pdf": "http://localhost:8080/audit/v1/qr/match-m1/export.pdf"
  },
  "signature": "d4e5f6a1b2c3..."
}
```

**Error codes:**
| HTTP | code | trigger |
|------|------|---------|
| 404  | `QR_NOT_FOUND` | entity_id not in qr_mappings |

**curl:**
```sh
curl -i http://localhost:8080/audit/v1/qr/match-m1
curl -i "http://localhost:8080/audit/v1/qr/match-m1?inspect=true"
```

---

## GET /audit/v1/qr/{entity_id}/export.{fmt}

Download QR code as `svg`, `png`, or `pdf`.

**curl:**
```sh
curl -o qr.svg http://localhost:8080/audit/v1/qr/match-m1/export.svg
curl -o qr.png http://localhost:8080/audit/v1/qr/match-m1/export.png
curl -o qr.pdf http://localhost:8080/audit/v1/qr/match-m1/export.pdf
```

SVG body starts with `<svg`. PNG magic header: `\x89PNG`. PDF starts with `%PDF-`.

---

## GET /q/{short_code}

Public redirect. Returns **302** to the live `target_route`. No auth needed.

Unknown code → 404 `QR_NOT_FOUND`.

**curl:**
```sh
curl -i http://localhost:8080/q/m1-live
# HTTP/1.1 302 Found
# Location: /web/matches/match-m1/live
```

---

## Flutter Notes

- UI reads: `short_url` (display/share), `target_route` (in-app navigation), `deep_link_uri` (launch native intent).
- On Android, fire `nascon://entity/{entity_id}` via `url_launcher` to open the native app; fall back to `target_route` in WebView.
- `target_route` changes as match state evolves (`/live` → `/vod` → `/notice?state=postponed`). Always re-fetch before navigating; never cache it.
