import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'secure_store.dart';

/// Centralized API Client using Dio.
/// Manages baseUrl in SharedPreferences and attaches Bearer JWT from SecureStore.
class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  static String get defaultBaseUrl {
    if (kIsWeb) return 'http://localhost:8080';
    if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:8080';
    return 'http://localhost:8080';
  }
  static const String _keyBaseUrl = 'api_base_url';

  late final Dio _dio;
  late String _currentBaseUrl;

  Dio get dio => _dio;

  ApiClient._internal() {
    _currentBaseUrl = defaultBaseUrl;
    _dio = Dio(
      BaseOptions(
        baseUrl: defaultBaseUrl,
        connectTimeout: const Duration(seconds: 4),
        receiveTimeout: const Duration(seconds: 4),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // Auth interceptor: automatically attaches Bearer token from secure storage
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await SecureStore.getJwt();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
      ),
    );
  }

  /// Load baseUrl from SharedPreferences (only server URL is kept in SharedPreferences).
  Future<String> getBaseUrl() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      var saved = prefs.getString(_keyBaseUrl);
      if (saved == null || (kIsWeb && saved.contains('10.0.2.2'))) {
        saved = defaultBaseUrl;
      }
      _currentBaseUrl = saved;
      _dio.options.baseUrl = _currentBaseUrl;
    } catch (_) {
      _currentBaseUrl = defaultBaseUrl;
    }
    return _currentBaseUrl;
  }

  /// Update and persist baseUrl in SharedPreferences.
  Future<void> setBaseUrl(String url) async {
    final cleanUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
    _currentBaseUrl = cleanUrl.isEmpty ? defaultBaseUrl : cleanUrl;
    _dio.options.baseUrl = _currentBaseUrl;

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_keyBaseUrl, _currentBaseUrl);
    } catch (_) {}
  }

  /// Calls GET {baseUrl}/health to test connectivity.
  Future<bool> checkHealth() async {
    try {
      await getBaseUrl();
      final response = await _dio.get('/health');
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Calls POST {baseUrl}/audit/v1/rbac-matrix to retrieve official tokens.
  Future<Map<String, dynamic>?> fetchRbacMatrix() async {
    try {
      await getBaseUrl();
      final response = await _dio.post('/audit/v1/rbac-matrix');
      if (response.statusCode == 200 && response.data is Map) {
        return Map<String, dynamic>.from(response.data as Map);
      }
    } catch (_) {}
    return null;
  }
}
