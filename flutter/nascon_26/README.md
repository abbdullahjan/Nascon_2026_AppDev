# NEXUS — NaSCon '26 League Operations

NEXUS is a Flutter client for NaSCon's multi-sport league and club-operations
platform. The frontend includes an overview, fixtures, standings, club store,
club profile, demo-role sign-in, local action queue, sync centre, and API
settings.

## Requirements

- Flutter 3.13.5 or later with Dart 3.13.5 or later
- Chrome, Windows, Android, or iOS target supported by your Flutter setup

## Run and test

From this directory:

```powershell
flutter pub get
flutter analyze
flutter test
flutter run -d chrome
```

To use another available target, replace `chrome` with its device ID from
`flutter devices`.

The app can start without a running backend; it will show the offline state.
Backend-dependent actions require the API service described by the parent
repository.

## API configuration

Set the API base URL in Settings:

- Android emulator: `http://10.0.2.2:8080`
- Physical Android device: `http://YOUR_LAPTOP_LAN_IP:8080`
- iOS simulator or local desktop: `http://127.0.0.1:8080`

The API client uses `/health`, `/audit/v1/offline-sync`, and
`/audit/v1/checkout`. Fixture and standings screens currently use sample data.
The demo sign-in is local UI functionality and is not a replacement for
server-issued authentication. Coordinate the offline-sync and checkout request
contracts with the backend before relying on those workflows.
