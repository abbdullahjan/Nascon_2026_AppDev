import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'api_client.dart';

const _uuid = Uuid();
const _secureStorage = FlutterSecureStorage();

class AppState extends ChangeNotifier {
  // ── Auth ──────────────────────────────────────────────────────────────────
  String? jwt;
  String role = 'viewer';
  String userName = 'Guest';
  String? userId;

  // ── Connection ────────────────────────────────────────────────────────────
  bool online = false;
  bool syncing = false;
  String serverUrl = 'http://10.0.2.2:8080';

  // ── Cart ──────────────────────────────────────────────────────────────────
  final Map<String, int> cart = {}; // variantId → qty

  // ── Offline queue ─────────────────────────────────────────────────────────
  late Box _syncBox;
  final List<Map<String, dynamic>> _pendingActions = [];
  List<Map<String, dynamic>> get pendingActions => List.unmodifiable(_pendingActions);

  // ── Cached league/fixtures ─────────────────────────────────────────────────
  late Box _cacheBox;
  List<Map<String, dynamic>> _sports = [];
  List<Map<String, dynamic>> get sports => List.unmodifiable(_sports);

  // ─────────────────────────────────────────────────────────────────────────
  Future<void> initialize() async {
    await Hive.initFlutter();
    _syncBox = await Hive.openBox('offline_queue');
    _cacheBox = await Hive.openBox('cache');

    final prefs = await SharedPreferences.getInstance();
    serverUrl = prefs.getString('serverUrl') ?? serverUrl;

    // Load secure auth
    jwt = await _secureStorage.read(key: 'jwt');
    role = await _secureStorage.read(key: 'role') ?? 'viewer';
    userName = await _secureStorage.read(key: 'userName') ?? 'Guest';
    userId = await _secureStorage.read(key: 'userId');

    // Load pending actions from Hive
    _loadQueue();

    await ApiClient().init();
    await ApiClient().updateBaseUrl(serverUrl);
    await checkConnection();
    
    // Load sports config
    await _loadSports();
  }

  Future<void> _loadSports() async {
    try {
      _sports = await ApiClient().getSports();
      notifyListeners();
    } catch (_) {
      // Fallback to empty list; screens will handle gracefully
    }
  }

  void _loadQueue() {
    _pendingActions.clear();
    for (final key in _syncBox.keys) {
      final v = _syncBox.get(key);
      if (v is String) {
        try {
          _pendingActions.add(Map<String, dynamic>.from(jsonDecode(v) as Map));
        } catch (_) {}
      }
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  Future<void> login(String email, String password) async {
    // ApiClient.login returns mock data in kDemoMode, real data otherwise
    final response = await ApiClient().login(email, password);
    jwt = response['token'] as String?;
    role = response['role'] as String? ?? 'viewer';
    userName = response['name'] as String? ?? email.split('@').first;
    userId = response['user_id'] as String?;
    await _secureStorage.write(key: 'jwt', value: jwt ?? '');
    await _secureStorage.write(key: 'role', value: role);
    await _secureStorage.write(key: 'userName', value: userName);
    if (userId != null) await _secureStorage.write(key: 'userId', value: userId!);
    notifyListeners();
  }

  Future<void> logout() async {
    jwt = null;
    role = 'viewer';
    userName = 'Guest';
    userId = null;
    await _secureStorage.deleteAll();
    notifyListeners();
  }

  bool get isLoggedIn => jwt != null;

  // ── Connection ────────────────────────────────────────────────────────────
  Future<void> checkConnection() async {
    online = await ApiClient().health();
    notifyListeners();
  }

  Future<void> setServerUrl(String url) async {
    serverUrl = url.trim().replaceAll(RegExp(r'/$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('serverUrl', serverUrl);
    await ApiClient().updateBaseUrl(serverUrl);
    await checkConnection();
    notifyListeners();
  }

  // ── Offline queue ─────────────────────────────────────────────────────────
  Future<void> queueScoreEvent({
    required String matchId,
    required String teamId,
    required String eventType,
    required int baseVersion,
  }) async {
    final actionId = 'a_${_uuid.v4()}';
    final eventId = 'evt_${_uuid.v4()}';
    final action = {
      'action_id': actionId,
      'type': 'score_event',
      'queued_at': DateTime.now().toUtc().toIso8601String(),
      'base_version': baseVersion,
      'status': 'pending',
      'payload': {
        'event_id': eventId,
        'match_id': matchId,
        'type': 'score',
        'payload': {'team_id': teamId, 'event_type': eventType},
      },
    };
    await _syncBox.put(actionId, jsonEncode(action));
    _pendingActions.add(action);
    notifyListeners();
  }

  Future<void> queueRosterTransfer(Map<String, dynamic> transferBody, int baseVersion) async {
    final actionId = 'a_${_uuid.v4()}';
    final requestId = 'tr_${_uuid.v4()}';
    final action = {
      'action_id': actionId,
      'type': 'roster_transfer',
      'queued_at': DateTime.now().toUtc().toIso8601String(),
      'base_version': baseVersion,
      'status': 'pending',
      'payload': {...transferBody, 'request_id': requestId},
    };
    await _syncBox.put(actionId, jsonEncode(action));
    _pendingActions.add(action);
    notifyListeners();
  }

  Future<Map<String, dynamic>> syncQueue() async {
    if (_pendingActions.isEmpty) {
      await checkConnection();
      return {'applied': 0, 'rejected': 0, 'duplicate': 0};
    }
    syncing = true;
    notifyListeners();

    online = await ApiClient().health();
    if (!online) {
      syncing = false;
      notifyListeners();
      return {'applied': 0, 'rejected': 0, 'duplicate': 0};
    }

    try {
      final deviceId = await _getDeviceId();
      final actionsToSync = List<Map<String, dynamic>>.from(_pendingActions);
      final response = await ApiClient().offlineSync(deviceId, actionsToSync);
      final results = (response['results'] as List?) ?? [];
      final summary = response['summary'] as Map<String, dynamic>? ?? {};

      // Update status in queue
      for (final result in results) {
        final actionId = result['action_id'] as String?;
        if (actionId == null) continue;
        final idx = _pendingActions.indexWhere((a) => a['action_id'] == actionId);
        if (idx >= 0) {
          final status = result['status'] as String?;
          if (status == 'applied' || status == 'duplicate') {
            await _syncBox.delete(actionId);
            _pendingActions.removeAt(idx);
          } else {
            _pendingActions[idx] = {..._pendingActions[idx], 'status': 'rejected', 'result': result};
            await _syncBox.put(actionId, jsonEncode(_pendingActions[idx]));
          }
        }
      }

      syncing = false;
      notifyListeners();
      return summary;
    } catch (e) {
      online = false;
      syncing = false;
      notifyListeners();
      rethrow;
    }
  }

  Future<String> _getDeviceId() async {
    String? id = await _secureStorage.read(key: 'device_id');
    if (id == null) {
      id = 'dev_${_uuid.v4()}';
      await _secureStorage.write(key: 'device_id', value: id);
    }
    return id;
  }

  // ── Cart ──────────────────────────────────────────────────────────────────
  void addToCart(String variantId, {int qty = 1}) {
    cart[variantId] = (cart[variantId] ?? 0) + qty;
    notifyListeners();
  }

  void removeFromCart(String variantId) {
    cart.remove(variantId);
    notifyListeners();
  }

  void clearCart() {
    cart.clear();
    notifyListeners();
  }

  int get cartCount => cart.values.fold(0, (s, q) => s + q);

  // ── Cache helpers ─────────────────────────────────────────────────────────
  Future<void> cacheData(String key, dynamic data) async {
    await _cacheBox.put(key, jsonEncode({'data': data, 'ts': DateTime.now().toIso8601String()}));
  }

  Map<String, dynamic>? getCached(String key) {
    final raw = _cacheBox.get(key);
    if (raw == null) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw as String) as Map);
    } catch (_) {
      return null;
    }
  }

  // ── Role helpers ───────────────────────────────────────────────────────────
  bool get isOrganizer => role == 'league_organizer' || role == 'super_admin';
  bool get isManager => role == 'club_manager' || role == 'super_admin';
  bool get isSuperAdmin => role == 'super_admin';
  bool get isPlayer => role == 'player';
}

// ── InheritedWidget scope ──────────────────────────────────────────────────
class AppStateScope extends InheritedNotifier<AppState> {
  const AppStateScope({super.key, required AppState state, required super.child})
      : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppStateScope>();
    assert(scope != null, 'AppStateScope not found in tree');
    return scope!.notifier!;
  }
}
