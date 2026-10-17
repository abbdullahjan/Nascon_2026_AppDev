import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DEMO / OFFLINE MODE  — set to false when the backend is running
// ─────────────────────────────────────────────────────────────────────────────
const bool kDemoMode = true;

// ── Global navigator key for 401 redirect ────────────────────────────────
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

// ── Money formatter ───────────────────────────────────────────────────────
String formatMoney(int minorUnits) {
  final major = minorUnits / 100.0;
  return 'PKR ${major.toStringAsFixed(2)}';
}

// ─────────────────────────────────────────────────────────────────────────────
// ApiClient — all methods return mock data when kDemoMode is true
// ─────────────────────────────────────────────────────────────────────────────
class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final FlutterSecureStorage _secure = const FlutterSecureStorage(); // used for device_id via AppState
  String _baseUrl = 'http://10.0.2.2:8080';

  // ── Init — no-op in demo mode ─────────────────────────────────────────
  Future<void> init() async {
    if (kDemoMode) return;
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString('serverUrl') ?? _baseUrl;
  }

  Future<void> updateBaseUrl(String url) async {
    _baseUrl = url.trim().replaceAll(RegExp(r'/$'), '');
  }

  // ── Health ────────────────────────────────────────────────────────────
  Future<bool> health() async {
    if (kDemoMode) return true; // always "connected" in demo
    try {
      // Would use real HTTP here
      return false;
    } catch (_) {
      return false;
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) async {
    if (kDemoMode) return _mockLogin(email, password);
    throw UnimplementedError('Real login not available without backend');
  }

  // ── RBAC matrix ───────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getRbacMatrix() async {
    if (kDemoMode) return _mockRbacMatrix();
    throw UnimplementedError('Real RBAC not available without backend');
  }

  // ── Fixtures ──────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> generateFixtures(Map<String, dynamic> body) async {
    if (kDemoMode) return {'rounds': [], 'format': body['format']};
    throw UnimplementedError();
  }

  // ── Standings ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getStandings(String leagueId) async {
    if (kDemoMode) return _mockStandings(leagueId);
    throw UnimplementedError();
  }

  // ── Score ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getScore(String matchId) async {
    if (kDemoMode) return _mockScore(matchId);
    throw UnimplementedError();
  }

  Future<Map<String, dynamic>> postEvent(Map<String, dynamic> body) async {
    if (kDemoMode) {
      return {
        'event_id': body['event_id'],
        'match_id': body['match_id'],
        'type': body['type'],
        'sequence': 1,
        'match_version': 1,
        'signature': 'demo_signature_00000000000000000000000000000000',
      };
    }
    throw UnimplementedError();
  }

  // ── Generic ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> get(String path,
      {Map<String, dynamic>? params}) async {
    if (kDemoMode) {
      if (path.contains('/standings/')) {
        final id = path.split('/').last;
        return _mockStandings(id);
      }
      if (path.contains('/score/')) {
        final id = path.split('/').last;
        return _mockScore(id);
      }
      if (path.contains('/inventory/')) {
        final id = path.split('/').last;
        return _mockInventory(id);
      }
      return {};
    }
    throw UnimplementedError();
  }

  Future<Map<String, dynamic>> post(String path, {dynamic data}) async {
    if (kDemoMode) return {};
    throw UnimplementedError();
  }

  // ── Roster ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getRosterHistory(String playerId,
      {String? asOf}) async {
    if (kDemoMode) {
      return {
        'player_id': playerId,
        'as_of': asOf ?? DateTime.now().toIso8601String().substring(0, 10),
        'current_squad_id': 'sq-a',
        'parent_squad_id': null,
        'history': [],
      };
    }
    throw UnimplementedError();
  }

  Future<Map<String, dynamic>> postTransfer(
      Map<String, dynamic> body) async {
    if (kDemoMode) {
      return {
        'request_id': body['request_id'] ?? 'tr-demo',
        'status': 'accepted',
        'state': 'active',
        'blocking_match_id': null,
      };
    }
    throw UnimplementedError();
  }

  // ── Store ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getInventory(String variantId) async {
    if (kDemoMode) return _mockInventory(variantId);
    throw UnimplementedError();
  }

  Future<Map<String, dynamic>> checkout(
      Map<String, dynamic> body) async {
    if (kDemoMode) return _mockCheckout(body);
    throw UnimplementedError();
  }

  // ── Offline sync ──────────────────────────────────────────────────────
  Future<Map<String, dynamic>> offlineSync(
      String deviceId, List<Map<String, dynamic>> actions) async {
    if (kDemoMode) {
      final results = actions.map((a) => {
        'action_id': a['action_id'],
        'status': 'applied',
        'resolution': 'appended',
        'error_code': null,
        'processed_order': actions.indexOf(a) + 1,
        'server_version': 5,
        'signature': null,
      }).toList();
      return {
        'device_id': deviceId,
        'results': results,
        'summary': {
          'applied': results.length,
          'rejected': 0,
          'duplicate': 0,
        },
      };
    }
    throw UnimplementedError();
  }

  // ── Error helpers ─────────────────────────────────────────────────────
  static String errorMessage(dynamic e) => e.toString();
  static String? errorCode(dynamic e) {
    if (e is MockPaymentException) return e.code;
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // MOCK DATA
  // ─────────────────────────────────────────────────────────────────────

  Map<String, dynamic> _mockLogin(String email, String password) {
    if (password != 'Nascon@26') throw Exception('Invalid email or password');
    const map = {
      'admin@nascon.test':     ('super_admin',      'Super Admin'),
      'organizer@nascon.test': ('league_organizer',  'Organizer'),
      'manager@nascon.test':   ('club_manager',      'Club Manager'),
      'player@nascon.test':    ('player',            'Player'),
      'viewer@nascon.test':    ('viewer',            'Viewer'),
    };
    final entry = map[email.trim().toLowerCase()];
    if (entry == null) throw Exception('Invalid email or password');
    return {
      'token': 'demo_jwt_token_${entry.$1}',
      'role': entry.$1,
      'name': entry.$2,
      'user_id': 'user-${entry.$1}',
    };
  }

  Map<String, dynamic> _mockRbacMatrix() => {
    'tokens': {
      'super_admin':      'demo_jwt_super_admin',
      'league_organizer': 'demo_jwt_organizer',
      'club_manager':     'demo_jwt_manager',
      'player':           'demo_jwt_player',
      'viewer':           'demo_jwt_viewer',
    },
    'context': {
      'tenant_id': 'tenant-alpha',
      'own_league_id': 'league-alpha-1',
    },
  };

  Map<String, dynamic> _mockStandings(String leagueId) => {
    'league_id': leagueId,
    'sport_id': 'football',
    'qualification_spots': 2,
    'table': [
      {'rank':1,'team_id':'Northside FC','played':8,'won':6,'drawn':1,'lost':1,'scored':18,'conceded':6,'diff':12,'points':19,'fair_play':0,'status':'clinched'},
      {'rank':2,'team_id':'Riverside Utd','played':8,'won':5,'drawn':2,'lost':1,'scored':14,'conceded':7,'diff':7,'points':17,'fair_play':0,'status':'clinched'},
      {'rank':3,'team_id':'Capital Athletic','played':8,'won':3,'drawn':2,'lost':3,'scored':10,'conceded':10,'diff':0,'points':11,'fair_play':0,'status':'still_possible'},
      {'rank':4,'team_id':'Valley Rangers','played':8,'won':2,'drawn':1,'lost':5,'scored':8,'conceded':14,'diff':-6,'points':7,'fair_play':0,'status':'still_possible'},
      {'rank':5,'team_id':'Eastside City','played':8,'won':0,'drawn':2,'lost':6,'scored':4,'conceded':17,'diff':-13,'points':2,'fair_play':0,'status':'eliminated'},
    ],
    'h2h': {},
  };

  Map<String, dynamic> _mockScore(String matchId) => {
    'match_id': matchId,
    'sport_id': 'football',
    'league_id': 'league-alpha-1',
    'status': 'in_progress',
    'outcome': 'pending',
    'winner_team_id': null,
    'tiebreak_winner_team_id': null,
    'home': {'team_id': 'Northside FC',   'score': 2, 'wickets': null, 'balls': null, 'overs': null, 'fair_play': 0},
    'away': {'team_id': 'Riverside Utd',  'score': 1, 'wickets': null, 'balls': null, 'overs': null, 'fair_play': 0},
    'version': 5,
    'events': [
      {'sequence':1,'event_id':'evt-001','type':'match_start','payload':{},'signature':'demo','compensated':false,'compensated_by':null},
      {'sequence':2,'event_id':'evt-002','type':'score','payload':{'team_id':'Northside FC','event_type':'goal'},'signature':'demo','compensated':false,'compensated_by':null},
      {'sequence':3,'event_id':'evt-003','type':'score','payload':{'team_id':'Riverside Utd','event_type':'goal'},'signature':'demo','compensated':false,'compensated_by':null},
      {'sequence':4,'event_id':'evt-004','type':'score','payload':{'team_id':'Northside FC','event_type':'goal'},'signature':'demo','compensated':false,'compensated_by':null},
    ],
  };

  Map<String, dynamic> _mockInventory(String variantId) => {
    'variant_id': variantId,
    'stock': variantId.endsWith('-M') ? 3 : 5,
    'reserved': 0,
  };

  Map<String, dynamic> _mockCheckout(Map<String, dynamic> body) {
    final token = (body['payment'] as Map?)?['token'] as String? ?? 'tok_success';
    if (token == 'tok_declined') {
      throw const MockPaymentException('PAYMENT_DECLINED', 'Payment was declined by the mock gateway');
    }
    if (token == 'tok_capture_fail') {
      throw const MockPaymentException('PAYMENT_CAPTURE_FAILED', 'Authorization succeeded but capture failed');
    }

    final items = body['items'] as List? ?? [];
    const unitPrice = 450000;
    final subtotal = items.fold<int>(
        0, (sum, item) => sum + unitPrice * ((item as Map)['quantity'] as int? ?? 1));
    final discCode = (body['discount_code'] as String? ?? '').toUpperCase();
    final discount = discCode == 'WELCOME10' ? subtotal * 10 ~/ 100 : 0;
    final total = subtotal - discount;
    final orderId = body['order_id'] as String? ?? 'ord-demo';
    final paidAt = DateTime.now().toUtc().toIso8601String();

    return {
      'order_id': orderId,
      'status': 'paid',
      'currency': 'PKR',
      'items': items.map((item) => {
        'variant_id': (item as Map)['variant_id'],
        'quantity': item['quantity'],
        'unit_price_minor': unitPrice,
      }).toList(),
      'subtotal_minor': subtotal,
      'discount_minor': discount,
      'total_minor': total,
      'payment': {
        'authorization_id': 'auth_demo_001',
        'capture_id': 'cap_demo_001',
        'state': 'captured',
      },
      'receipt': {
        'payload': {
          'order_id': orderId,
          'customer_id': body['customer_id'],
          'items': items.map((item) => {
            'variant_id': (item as Map)['variant_id'],
            'quantity': item['quantity'],
            'unit_price_minor': unitPrice,
          }).toList(),
          'subtotal_minor': subtotal,
          'discount_minor': discount,
          'total_minor': total,
          'currency': 'PKR',
          'paid_at': paidAt,
        },
        'signature': 'demo_signature_00000000000000000000000000000000',
        'pdf_base64': null, // PDF generation requires backend
      },
    };
  }
}

// Public exception so screens can catch payment errors from the mock
class MockPaymentException implements Exception {
  const MockPaymentException(this.code, this.message);
  final String code;
  final String message;
  @override
  String toString() => message;
}
