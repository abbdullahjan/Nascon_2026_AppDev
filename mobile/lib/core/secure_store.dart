import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure Storage manager for sensitive auth tokens and role data.
/// Uses flutter_secure_storage exclusively (never SharedPreferences).
class SecureStore {
  static const _storage = FlutterSecureStorage();

  static const _keyJwt = 'auth_jwt_token';
  static const _keyRole = 'user_role';
  static const _keyEmail = 'user_email';
  static const _keyUserId = 'user_id';

  /// Save JWT, role, and email to secure platform keychain/keystore.
  static Future<void> saveAuth({
    required String jwt,
    required String role,
    String? email,
    String? userId,
  }) async {
    await _storage.write(key: _keyJwt, value: jwt);
    await _storage.write(key: _keyRole, value: role);
    if (email != null) {
      await _storage.write(key: _keyEmail, value: email);
    }
    if (userId != null) {
      await _storage.write(key: _keyUserId, value: userId);
    }
  }

  /// Retrieve the stored JWT token.
  static Future<String?> getJwt() async {
    return await _storage.read(key: _keyJwt);
  }

  /// Retrieve the active role.
  static Future<String?> getRole() async {
    return await _storage.read(key: _keyRole);
  }

  /// Retrieve the active user email.
  static Future<String?> getEmail() async {
    return await _storage.read(key: _keyEmail);
  }

  /// Retrieve the active user ID.
  static Future<String?> getUserId() async {
    return await _storage.read(key: _keyUserId);
  }

  /// Check whether a valid JWT is saved.
  static Future<bool> hasSavedToken() async {
    final token = await getJwt();
    return token != null && token.isNotEmpty;
  }

  /// Wipe all credentials on logout.
  static Future<void> clearAuth() async {
    await _storage.delete(key: _keyJwt);
    await _storage.delete(key: _keyRole);
    await _storage.delete(key: _keyEmail);
    await _storage.delete(key: _keyUserId);
  }
}
