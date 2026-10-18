import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api_client.dart';
import '../models/club.dart';
import '../models/league.dart';
import '../models/match.dart';
import '../models/product.dart';
import '../models/standing.dart';
import '../models/sync_action.dart';
import 'offline_queue_service.dart';

/// Centralized API Service for NaSCon '26 Mobile Application.
/// Handles network communication, response deserialization, offline fallback caching,
/// and offline action queuing.
class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  Dio get _dio => ApiClient().dio;

  // ── Local Cache Helpers (for Offline Desk Check NFR-4) ──────────────────────

  Future<void> _saveCache(String key, dynamic data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('cache_$key', jsonEncode(data));
    } catch (_) {}
  }

  Future<dynamic> _loadCache(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final str = prefs.getString('cache_$key');
      if (str != null && str.isNotEmpty) {
        return jsonDecode(str);
      }
    } catch (_) {}
    return null;
  }

  // ── Fixtures & Matches ──────────────────────────────────────────────────────

  /// Get list of matches with optional league, status, or club filters.
  Future<List<MatchModel>> getMatches({
    String? leagueId,
    String? status,
    String? clubId,
    String? sportId,
  }) async {
    final cacheKey = 'matches_${leagueId ?? "all"}_${status ?? "all"}';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get(
        '/api/v1/matches',
        queryParameters: {
          if (leagueId != null && leagueId.isNotEmpty) 'league_id': leagueId,
          if (status != null && status.isNotEmpty) 'status': status,
          if (clubId != null && clubId.isNotEmpty) 'club_id': clubId,
          if (sportId != null && sportId.isNotEmpty) 'sport_id': sportId,
        },
      );

      if (response.statusCode == 200 && response.data is Map) {
        final list = response.data['matches'] as List? ?? [];
        await _saveCache(cacheKey, list);
        return list
            .whereType<Map>()
            .map((item) => MatchModel.fromJson(Map<String, dynamic>.from(item)))
            .toList();
      }
    } catch (e) {
      debugPrint('getMatches online error, loading cache: $e');
    }

    // Offline fallback
    final cached = await _loadCache(cacheKey);
    if (cached is List) {
      return cached
          .whereType<Map>()
          .map((item) => MatchModel.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    return [];
  }

  /// Get match details with live score projection and pinned merchandise.
  Future<MatchModel?> getMatchDetail(String matchId) async {
    final cacheKey = 'match_detail_$matchId';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get('/api/v1/matches/$matchId');
      if (response.statusCode == 200 && response.data is Map) {
        final matchData = response.data['match'];
        if (matchData is Map) {
          await _saveCache(cacheKey, matchData);
          return MatchModel.fromJson(Map<String, dynamic>.from(matchData));
        }
      }
    } catch (e) {
      debugPrint('getMatchDetail error: $e');
    }

    final cached = await _loadCache(cacheKey);
    if (cached is Map) {
      return MatchModel.fromJson(Map<String, dynamic>.from(cached));
    }
    return null;
  }

  /// Get timeline of events for a match.
  Future<List<MatchEventModel>> getMatchEvents(String matchId) async {
    final cacheKey = 'match_events_$matchId';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get('/api/v1/matches/$matchId/events');
      if (response.statusCode == 200 && response.data is Map) {
        final eventsList = response.data['events'] as List? ?? [];
        await _saveCache(cacheKey, eventsList);
        return eventsList
            .whereType<Map>()
            .map((ev) => MatchEventModel.fromJson(Map<String, dynamic>.from(ev)))
            .toList();
      }
    } catch (e) {
      debugPrint('getMatchEvents error: $e');
    }

    final cached = await _loadCache(cacheKey);
    if (cached is List) {
      return cached
          .whereType<Map>()
          .map((ev) => MatchEventModel.fromJson(Map<String, dynamic>.from(ev)))
          .toList();
    }
    return [];
  }

  /// Append a score event or compensating event (Organizer action).
  Future<Map<String, dynamic>> postScoreEvent({
    required String matchId,
    required String type, // 'score' | 'compensation'
    required Map<String, dynamic> payload,
    String? targetEventId,
  }) async {
    await ApiClient().getBaseUrl();
    final body = {
      'match_id': matchId,
      'type': type,
      'payload': payload,
      if (targetEventId != null) 'target_event_id': targetEventId,
    };

    try {
      final response = await _dio.post('/api/v1/matches/$matchId/events', data: body);
      return {'success': true, 'data': response.data};
    } on DioException catch (e) {
      // If offline, enqueue into the persistent offline queue
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout) {
        await OfflineQueueService().enqueue(
          type: 'score_event',
          baseVersion: 1,
          payload: body,
        );
        return {
          'success': true,
          'queued_offline': true,
          'message': 'Offline: Score event queued for sync.'
        };
      }

      final errorMsg = e.response?.data?['error']?['message'] ?? e.message ?? 'Score event failed';
      return {'success': false, 'error': errorMsg};
    }
  }

  // ── Leagues & Standings ─────────────────────────────────────────────────────

  /// Get list of leagues.
  Future<List<LeagueModel>> getLeagues({String? tenantId, String? sportId}) async {
    const cacheKey = 'leagues_list';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get(
        '/api/v1/leagues',
        queryParameters: {
          if (tenantId != null) 'tenant_id': tenantId,
          if (sportId != null) 'sport_id': sportId,
        },
      );
      if (response.statusCode == 200 && response.data is Map) {
        final list = response.data['leagues'] as List? ?? [];
        await _saveCache(cacheKey, list);
        return list
            .whereType<Map>()
            .map((item) => LeagueModel.fromJson(Map<String, dynamic>.from(item)))
            .toList();
      }
    } catch (e) {
      debugPrint('getLeagues error: $e');
    }

    final cached = await _loadCache(cacheKey);
    if (cached is List) {
      return cached
          .whereType<Map>()
          .map((item) => LeagueModel.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    return [];
  }

  /// Get standings points table for a league.
  Future<LeagueStandings?> getStandings(String leagueId) async {
    final cacheKey = 'standings_$leagueId';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get('/api/v1/leagues/$leagueId/standings');
      if (response.statusCode == 200 && response.data is Map) {
        await _saveCache(cacheKey, response.data);
        return LeagueStandings.fromJson(Map<String, dynamic>.from(response.data));
      }
    } catch (e) {
      debugPrint('getStandings error: $e');
    }

    final cached = await _loadCache(cacheKey);
    if (cached is Map) {
      return LeagueStandings.fromJson(Map<String, dynamic>.from(cached));
    }
    return null;
  }

  // ── Clubs & Rosters ─────────────────────────────────────────────────────────

  /// Get list of all clubs.
  Future<List<ClubModel>> getClubs({String? tenantId}) async {
    const cacheKey = 'clubs_list';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get(
        '/api/v1/clubs',
        queryParameters: {if (tenantId != null) 'tenant_id': tenantId},
      );
      if (response.statusCode == 200 && response.data is Map) {
        final list = response.data['clubs'] as List? ?? [];
        await _saveCache(cacheKey, list);
        return list
            .whereType<Map>()
            .map((item) => ClubModel.fromJson(Map<String, dynamic>.from(item)))
            .toList();
      }
    } catch (e) {
      debugPrint('getClubs error: $e');
    }

    final cached = await _loadCache(cacheKey);
    if (cached is List) {
      return cached
          .whereType<Map>()
          .map((item) => ClubModel.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    return [];
  }

  /// Get single club profile and its roster.
  Future<ClubModel?> getClubDetail(String clubId) async {
    final cacheKey = 'club_profile_$clubId';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get('/api/v1/clubs/$clubId');
      final rosterRes = await _dio.get('/api/v1/clubs/$clubId/roster');

      if (response.statusCode == 200 && response.data is Map) {
        final clubData = Map<String, dynamic>.from(response.data['club'] ?? {});
        if (rosterRes.statusCode == 200 && rosterRes.data is Map) {
          clubData['roster'] = rosterRes.data['players'] ?? [];
        }
        await _saveCache(cacheKey, clubData);
        return ClubModel.fromJson(clubData);
      }
    } catch (e) {
      debugPrint('getClubDetail error: $e');
    }

    final cached = await _loadCache(cacheKey);
    if (cached is Map) {
      return ClubModel.fromJson(Map<String, dynamic>.from(cached));
    }
    return null;
  }

  /// Perform a roster transfer, loan, or release (Manager action).
  Future<Map<String, dynamic>> rosterTransfer(Map<String, dynamic> body) async {
    await ApiClient().getBaseUrl();
    try {
      final response = await _dio.post('/audit/v1/roster/transfer', data: body);
      return {'success': true, 'data': response.data};
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout) {
        await OfflineQueueService().enqueue(
          type: 'roster_transfer',
          baseVersion: 1,
          payload: body,
        );
        return {
          'success': true,
          'queued_offline': true,
          'message': 'Offline: Roster action queued for sync.'
        };
      }
      final errorMsg = e.response?.data?['error']?['message'] ?? e.message ?? 'Roster transfer failed';
      return {'success': false, 'error': errorMsg};
    }
  }

  // ── Merchandise Store & Checkout ───────────────────────────────────────────

  /// Get all merchandise products and variants.
  Future<List<ProductModel>> getProducts({String? tenantId}) async {
    const cacheKey = 'products_list';
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.get(
        '/api/v1/products',
        queryParameters: {if (tenantId != null) 'tenant_id': tenantId},
      );
      if (response.statusCode == 200 && response.data is Map) {
        final list = response.data['products'] as List? ?? [];
        await _saveCache(cacheKey, list);
        return list
            .whereType<Map>()
            .map((item) => ProductModel.fromJson(Map<String, dynamic>.from(item)))
            .toList();
      }
    } catch (e) {
      debugPrint('getProducts error: $e');
    }

    final cached = await _loadCache(cacheKey);
    if (cached is List) {
      return cached
          .whereType<Map>()
          .map((item) => ProductModel.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    return [];
  }

  /// Execute merchandise checkout with atomic stock reservation and mock payment.
  Future<CheckoutResult> checkout({
    required String orderId,
    required String customerId,
    required List<Map<String, dynamic>> items,
    String? discountCode,
    required String paymentToken, // 'tok_success' | 'tok_declined' | 'tok_capture_fail'
  }) async {
    await ApiClient().getBaseUrl();
    final body = {
      'order_id': orderId,
      'customer_id': customerId,
      'items': items,
      'discount_code': (discountCode != null && discountCode.trim().isNotEmpty) ? discountCode.trim() : null,
      'payment': {'token': paymentToken},
    };

    final response = await _dio.post('/api/v1/products/checkout', data: body);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return CheckoutResult.fromJson(Map<String, dynamic>.from(response.data));
    }
    throw Exception('Checkout failed with status ${response.statusCode}');
  }

  // ── Offline Synchronization ────────────────────────────────────────────────

  /// Synchronize the queued offline actions with the backend (POST /api/v1/sync).
  Future<SyncResponse> syncOfflineQueue() async {
    final queue = await OfflineQueueService().getQueue();
    if (queue.isEmpty) {
      return SyncResponse(
        deviceId: await OfflineQueueService().getDeviceId(),
        results: [],
        summary: SyncSummary(applied: 0, rejected: 0, duplicate: 0),
      );
    }

    OfflineQueueService().isSyncingNotifier.value = true;
    final deviceId = await OfflineQueueService().getDeviceId();

    try {
      await ApiClient().getBaseUrl();
      final body = {
        'device_id': deviceId,
        'actions': queue.map((a) => a.toJson()).toList(),
      };

      final response = await _dio.post('/api/v1/sync', data: body);
      final syncResponse = SyncResponse.fromJson(Map<String, dynamic>.from(response.data));

      // Clear the queue after successful sync
      await OfflineQueueService().clearQueue();
      return syncResponse;
    } finally {
      OfflineQueueService().isSyncingNotifier.value = false;
    }
  }

  // ── Admin Reset ─────────────────────────────────────────────────────────────

  /// Trigger database re-seed (POST /audit/v1/reset).
  Future<bool> resetData({int seed = 42}) async {
    try {
      await ApiClient().getBaseUrl();
      final response = await _dio.post(
        '/audit/v1/reset',
        data: {
          'seed': seed,
          'stock': {'var-jersey-001-M': 1, 'var-jersey-001-L': 5},
        },
      );
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
