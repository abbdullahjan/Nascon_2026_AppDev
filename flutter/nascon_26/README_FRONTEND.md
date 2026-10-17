# NEXUS — NaSCon Flutter Frontend

A UI-first Flutter implementation for the NaSCon '26 Part I multi-sport league and club-operations platform.

## Included
- Overview / matchday dashboard
- Fixtures list with status filters and match detail
- Standings table with qualification labels
- Merchandise catalogue, cart and backend checkout request
- Club profile and roster management action queue
- Demo-role sign-in for the five official accounts
- API base URL setting
- Online/offline indicator
- Persistent pending action queue using SharedPreferences
- Secure storage for signed-in email using flutter_secure_storage
- Sync centre showing pending actions and results
- Dark sports-operations visual system with lime accent, large tap targets and clear state labels

## Run in the repository

```powershell
cd flutter/nascon_26
flutter pub get
flutter analyze
flutter test
flutter run -d chrome
```

The app dependencies are already included in `pubspec.yaml`.

## API configuration
- Android emulator: `http://10.0.2.2:8080`
- Physical Android device: `http://YOUR_LAPTOP_LAN_IP:8080`
- iOS simulator: `http://127.0.0.1:8080`

Set this inside Settings.

## Important integration notes
- The API client calls `/health`, `/audit/v1/offline-sync`, and `/audit/v1/checkout`.
- Score and roster actions are queued locally with `action_id`, `base_version`, `type`, `payload`, and `created_at`.
- The `/audit/v1/offline-sync` contract may require a different exact field shape than the current generic request. Coordinate with the backend teammate and adjust `AppState.syncQueue()` to the backend's exact implementation.
- The sign-in is a local UI/demo implementation, not a substitute for server-issued JWT authentication. Connect it to the backend login/token flow once your teammate exposes that route.
- Fixture and standings screens currently include designed sample data to avoid blank UI while backend endpoints are being implemented. Replace the sample arrays with API-backed repositories when the corresponding routes are ready.
- Store checkout requires the real `/audit/v1/checkout` contract. Errors are shown in plain language; no fake success is displayed.
- This is not a completed/verified release APK. Run analyzer/tests and build it locally against your team's current Flutter SDK.
