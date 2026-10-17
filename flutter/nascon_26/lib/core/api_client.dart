import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ── Global navigator key for 401 redirect ─────────────────────────────────
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  late Dio _dio;
  final FlutterSecureStorage _secure = const FlutterSecureStorage();

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final baseUrl = prefs.getString('serverUrl') ?? 'http://10.0.2.2:8080';
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 10),
      contentType: 'application/json',
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _secure.read(key: 'jwt');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          await _secure.deleteAll();
          navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (_) => false);
        }
        handler.next(error);
      },
    ));
  }

  Future<void> updateBaseUrl(String url) async {
    _dio.options.baseUrl = url.trim().replaceAll(RegExp(r'/$'), '');
  }

  // ── Health ──────────────────────────────────────────────────────────────
  Future<bool> health() async {
    try {
      final r = await _dio.get('/health');
      return r.statusCode == 200 && r.data['status'] == 'ok';
    } catch (_) {
      return false;
    }
  }

  // ── Login ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) async {
    final r = await _dio.post('/api/v1/login', data: {'email': email, 'password': password});
    return r.data as Map<String, dynamic>;
  }

  // ── Generic ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? params}) async {
    final r = await _dio.get(path, queryParameters: params);
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> post(String path, {dynamic data}) async {
    final r = await _dio.post(path, data: data);
    return r.data as Map<String, dynamic>;
  }

  // ── RBAC matrix ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getRbacMatrix() async {
    final r = await _dio.post('/audit/v1/rbac-matrix');
    return r.data as Map<String, dynamic>;
  }

  // ── Fixtures ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> generateFixtures(Map<String, dynamic> body) async {
    final r = await _dio.post('/audit/v1/fixtures', data: body);
    return r.data as Map<String, dynamic>;
  }

  // ── Standings ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getStandings(String leagueId) async {
    final r = await _dio.get('/audit/v1/standings/$leagueId');
    return r.data as Map<String, dynamic>;
  }

  // ── Score ────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getScore(String matchId) async {
    final r = await _dio.get('/audit/v1/score/$matchId');
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> postEvent(Map<String, dynamic> body) async {
    final r = await _dio.post('/audit/v1/events', data: body);
    return r.data as Map<String, dynamic>;
  }

  // ── Roster ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getRosterHistory(String playerId, {String? asOf}) async {
    final r = await _dio.get('/audit/v1/roster/history/$playerId',
        queryParameters: asOf != null ? {'as_of': asOf} : null);
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> postTransfer(Map<String, dynamic> body) async {
    final r = await _dio.post('/audit/v1/roster/transfer', data: body);
    return r.data as Map<String, dynamic>;
  }

  // ── Store ────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getInventory(String variantId) async {
    final r = await _dio.get('/audit/v1/inventory/$variantId');
    return r.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> checkout(Map<String, dynamic> body) async {
    final r = await _dio.post('/audit/v1/checkout', data: body);
    return r.data as Map<String, dynamic>;
  }

  // ── Offline sync ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> offlineSync(String deviceId, List<Map<String, dynamic>> actions) async {
    final r = await _dio.post('/audit/v1/offline-sync',
        data: {'device_id': deviceId, 'actions': actions});
    return r.data as Map<String, dynamic>;
  }

  // ── Error helper ─────────────────────────────────────────────────────────
  static String errorMessage(dynamic e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['error'] is Map) {
        return data['error']['message'] ?? 'Request failed';
      }
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return 'Cannot reach server — check your connection';
      }
    }
    return e.toString();
  }

  static String? errorCode(dynamic e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['error'] is Map) {
        return data['error']['code'] as String?;
      }
    }
    return null;
  }

  // Expose raw Dio for advanced use
  Dio get dio => _dio;
}

// ── Money formatter ────────────────────────────────────────────────────────
String formatMoney(int minorUnits) {
  final major = minorUnits / 100.0;
  return 'PKR ${major.toStringAsFixed(2)}';
}
