# Module 9 — RBAC, Auth & Security

## What the Backend Exposes
```
POST /audit/v1/rbac-matrix          — returns JWTs for all 5 roles (no auth needed)
POST /audit/v1/rbac/tenants                          — probe P1
POST /audit/v1/rbac/leagues/{league_id}/fixtures     — probe P2
POST /audit/v1/rbac/clubs/{club_id}/roster           — probe P3
POST /audit/v1/rbac/clubs/{club_id}/products         — probe P4
PATCH /audit/v1/rbac/players/{player_id}             — probe P5
GET  /audit/v1/rbac/clubs/{club_id}                  — probe P6
GET  /audit/v1/rbac/platform/config                  — probe P7
GET  /api/v1/ping                   — rate limit probe
```

---

## What You Build

### Screen: Login
**First screen after splash/health check**

**Display:**
- App logo / NaSCon branding
- Email text field
- Password text field (with show/hide toggle)
- "Sign In" button
- Loading state on button while request is in flight

**Flow:**
1. User enters credentials
2. Call your backend login endpoint (ask backend dev for the exact route)
3. On success → receive JWT
4. Store JWT in **Flutter Secure Storage** (never SharedPreferences or local storage)
5. Decode JWT to get the user's role (or backend returns role in response)
6. Navigate to role-appropriate home screen

**Demo credentials (always work):**
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@nascon.test | Nascon@26 |
| League Organizer | organizer@nascon.test | Nascon@26 |
| Club Manager | manager@nascon.test | Nascon@26 |
| Player | player@nascon.test | Nascon@26 |
| Viewer | viewer@nascon.test | Nascon@26 |

**Errors to handle:**
| Situation | User message |
|-----------|--------------|
| 401 response | "Invalid email or password" |
| Network error | "Cannot reach server — check your connection" |
| Empty fields | Inline validation before sending request |

---

### Role-Aware Navigation
After login, show different home screens and nav items based on role:

| Role | Home Screen | Nav Items Shown |
|------|-------------|-----------------|
| Super Admin | Admin dashboard | All screens + admin panel |
| League Organizer | Fixtures (own league) | Fixtures, Standings, Scoring Entry |
| Club Manager | Club Profile (own club) | Club, Roster Management, Store |
| Player | Own profile + Fixtures | Fixtures, Standings, Profile |
| Viewer | Fixtures list | Fixtures, Standings, Store |

**Rule:** Never show a button or nav item the user's role cannot access.
If they somehow reach a forbidden screen → show "You don't have permission to view this" 
with a back button. Never show a raw 403 error code.

---

### JWT Handling (Dio Interceptor)
Set this up in Module 0 but it enforces the rules from this module:

```dart
// Attach token to every request
options.headers['Authorization'] = 'Bearer $token';

// Handle 401 globally
if (response.statusCode == 401) {
  await secureStorage.delete(key: 'jwt');
  navigatorKey.currentState?.pushReplacementNamed('/login');
}

// Handle 403 globally  
if (response.statusCode == 403) {
  // Show "Access denied" snackbar, don't crash
}
```

---

### Secure Token Storage
```dart
// Store after login
await secureStorage.write(key: 'jwt', value: token);
await secureStorage.write(key: 'role', value: role);

// Read on app start
final token = await secureStorage.read(key: 'jwt');
if (token == null) {
  // Go to login
}

// Clear on logout
await secureStorage.deleteAll();
```

**Never** store the token in:
- SharedPreferences
- Hive (unencrypted)
- Any plain local file

---

### Logout
- Clear secure storage
- Navigate to Login screen
- Clear any cached data if needed

---

### Rate Limiting (what you will see)
The `/api/v1/ping` endpoint is rate limited to 100 requests per 10 seconds.
Your app should **not** hammer any endpoint. If you get a `429` response:
- Show a brief "Too many requests, please wait" message
- Implement exponential backoff if you're polling for live scores
- The response includes a `Retry-After` header — respect it

---

## Security Checklist for Your App
- [ ] JWT stored in Flutter Secure Storage (Keystore/Keychain backed)
- [ ] No credentials or tokens in plain SharedPreferences
- [ ] All API calls use HTTPS in production (HTTP ok for local dev)
- [ ] Show role-appropriate UI — hide buttons the user cannot use
- [ ] 401 → redirect to login automatically
- [ ] 403 → show friendly "Access denied" message
- [ ] Never show raw error codes (like "Error 403") to the user
- [ ] Input validation before sending forms (empty fields, invalid formats)
