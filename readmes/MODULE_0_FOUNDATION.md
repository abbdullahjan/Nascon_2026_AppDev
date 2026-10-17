# Module 0 — App Foundation & Health Check

## What the Backend Exposes
```
GET /health
```
Returns `200 {"status": "ok"}` when the database is up and baseline data is seeded.
No auth required.

---

## What You Build

### Splash Screen
- On app launch, call `GET /health`
- If `200` → proceed to Login screen
- If fails / timeout → show "Cannot reach server" with a retry button and a settings icon to change the server URL
- Show a loading spinner while checking

### Settings Screen (reachable from Splash and from any screen's top-bar)
- A text field for the base server URL
- Default: `http://10.0.2.2:8080` (emulator) or allow user to type LAN IP
- Save to local storage (SharedPreferences is fine for this non-sensitive config)
- A "Test Connection" button that calls `/health` and shows success/failure

### App-wide Setup
- Configure **Dio** base URL from saved settings
- Add a **Dio interceptor** that:
  - Attaches `Authorization: Bearer <jwt>` to every request (read from Flutter Secure Storage)
  - On 401 response → clear stored JWT → navigate to Login
- Set up **Hive** or **Drift** local database for offline caching (needed in Module 10)

---

## UI Notes
- The splash screen is the first impression — keep it clean, show the NaSCon / tenant logo
- Do not show the server URL on the splash screen itself — only in settings
- Loading state must have a visible indicator (CircularProgressIndicator)

---

## Dependencies to Add
```yaml
# pubspec.yaml
dio: ^5.x
flutter_secure_storage: ^9.x
hive_flutter: ^1.x   # or drift for SQLite
shared_preferences: ^2.x
```
