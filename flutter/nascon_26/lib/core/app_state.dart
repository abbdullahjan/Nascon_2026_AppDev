import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';

class AppState extends ChangeNotifier {
  final ApiClient api = ApiClient();
  final FlutterSecureStorage secureStorage = const FlutterSecureStorage();
  SharedPreferences? _prefs;

  String role = 'General Viewer';
  String userName = 'Guest Viewer';
  bool online = false;
  bool syncing = false;
  String serverUrl = 'http://10.0.2.2:8080';
  final List<Map<String, dynamic>> pendingActions = [];
  final List<Map<String, dynamic>> activity = [];
  final Map<String, int> cart = {};
  String selectedTenant = 'Alpha Sports';

  Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
    serverUrl = _prefs?.getString('serverUrl') ?? serverUrl;
    role = _prefs?.getString('role') ?? role;
    userName = _prefs?.getString('userName') ?? userName;
    final queued = _prefs?.getString('pendingActions');
    if (queued != null) {
      try {
        pendingActions.addAll(List<Map<String, dynamic>>.from(jsonDecode(queued)));
      } catch (_) {}
    }
    api.baseUrl = serverUrl;
    await checkConnection();
  }

  Future<void> setServerUrl(String value) async {
    serverUrl = value.trim().replaceAll(RegExp(r'/$'), '');
    api.baseUrl = serverUrl;
    await _prefs?.setString('serverUrl', serverUrl);
    await checkConnection();
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    // The Day 1 brief defines demo identities. Keep credentials out of plaintext storage.
    const accounts = {
      'admin@nascon.test': ('Platform Super-Admin', 'Platform Admin'),
      'organizer@nascon.test': ('League Organizer', 'League Organizer'),
      'manager@nascon.test': ('Club Manager', 'Club Manager'),
      'player@nascon.test': ('Player', 'Player'),
      'viewer@nascon.test': ('General Viewer', 'General Viewer'),
    };
    final account = accounts[email.trim().toLowerCase()];
    if (account == null || password != 'Nascon@26') {
      throw Exception('Email or password is incorrect.');
    }
    role = account.$1;
    userName = account.$2;
    await _prefs?.setString('role', role);
    await _prefs?.setString('userName', userName);
    await secureStorage.write(key: 'signedInEmail', value: email.trim().toLowerCase());
    notifyListeners();
  }

  Future<void> signOut() async {
    role = 'General Viewer';
    userName = 'Guest Viewer';
    await _prefs?.setString('role', role);
    await _prefs?.setString('userName', userName);
    await secureStorage.delete(key: 'signedInEmail');
    notifyListeners();
  }

  Future<void> checkConnection() async {
    online = await api.health();
    notifyListeners();
  }

  Future<void> queueAction(String type, Map<String, dynamic> payload) async {
    final action = {
      'action_id': 'act-${DateTime.now().microsecondsSinceEpoch}',
      'type': type,
      'payload': payload,
      'base_version': 0,
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'status': 'pending',
    };
    pendingActions.add(action);
    await _persistQueue();
    notifyListeners();
  }

  Future<void> _persistQueue() async {
    await _prefs?.setString('pendingActions', jsonEncode(pendingActions));
  }

  Future<void> syncQueue() async {
    if (pendingActions.isEmpty) {
      await checkConnection();
      return;
    }
    syncing = true;
    notifyListeners();
    online = await api.health();
    if (!online) {
      syncing = false;
      notifyListeners();
      return;
    }
    try {
      final response = await api.post('/audit/v1/offline-sync', {'actions': pendingActions});
      final results = (response['results'] as List?) ?? const [];
      for (final result in results) {
        activity.insert(0, Map<String, dynamic>.from(result as Map));
      }
      // Contract returns per-action applied/rejected results; retain only actions the
      // server explicitly identifies as unresolved, otherwise clear acknowledged queue.
      final unresolved = response['pending_actions'];
      pendingActions
        ..clear()
        ..addAll(unresolved is List
            ? unresolved.map((e) => Map<String, dynamic>.from(e as Map))
            : <Map<String, dynamic>>[]);
      await _persistQueue();
    } catch (_) {
      online = false;
    }
    syncing = false;
    notifyListeners();
  }

  Future<Map<String, dynamic>?> getJson(String path) => api.get(path);

  Future<void> addToCart(String variantId) async {
    cart[variantId] = (cart[variantId] ?? 0) + 1;
    notifyListeners();
  }

  void clearCart() {
    cart.clear();
    notifyListeners();
  }

  int get cartCount => cart.values.fold(0, (sum, qty) => sum + qty);
}

class AppStateScope extends InheritedNotifier<AppState> {
  const AppStateScope({super.key, required AppState state, required super.child})
      : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppStateScope>();
    assert(scope != null, 'AppStateScope missing');
    return scope!.notifier!;
  }
}
