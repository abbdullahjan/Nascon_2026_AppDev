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

  // ── Sports ────────────────────────────────────────────────────────────
  /// Returns the list of all sports with their full configs.
  /// Used by the UI to determine scoring model, event types, periods, etc.
  Future<List<Map<String, dynamic>>> getSports() async {
    if (kDemoMode) return _mockSports();
    throw UnimplementedError();
  }

  // ── Fixtures ──────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> generateFixtures(Map<String, dynamic> body) async {
    if (kDemoMode) return _mockFixtures(body);
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

  // ── Mock sports config (matches backend seed exactly) ─────────────────
  List<Map<String, dynamic>> _mockSports() => [
    {
      'sport_id': 'football',
      'name': 'Football',
      'scoring_model': 'event',
      'periods': {'count': 2, 'duration_minutes': 45},
      'scoring_events': {'goal': {'points': 1}},
      'draw_allowed': true,
      'overtime': {'policy': 'none'},
      'tie_break_order': ['h2h_points', 'h2h_diff', 'overall_diff', 'scored', 'fair_play', 'draw_lots'],
      'roster': {'min_squad_size': 11, 'max_squad_size': 25, 'required_positions': {'gk': 1}},
    },
    {
      'sport_id': 'basketball',
      'name': 'Basketball',
      'scoring_model': 'event',
      'periods': {'count': 4, 'duration_minutes': 12},
      'scoring_events': {
        'free_throw': {'points': 1},
        'two_pointer': {'points': 2},
        'three_pointer': {'points': 3},
      },
      'draw_allowed': false,
      'overtime': {'policy': 'extra_time', 'duration_minutes': 5},
      'tie_break_order': ['h2h_points', 'h2h_diff', 'overall_diff', 'scored', 'fair_play', 'draw_lots'],
      'roster': {'min_squad_size': 5, 'max_squad_size': 15, 'required_positions': {}},
    },
    {
      'sport_id': 'cricket',
      'name': 'Cricket',
      'scoring_model': 'innings',
      'periods': {'innings_per_team': 1, 'overs_per_innings': 20, 'balls_per_over': 6, 'wickets_per_innings': 10},
      'scoring_events': {
        'dot_ball': {'runs': 0, 'legal_ball': true, 'wicket': false},
        'single': {'runs': 1, 'legal_ball': true, 'wicket': false},
        'two': {'runs': 2, 'legal_ball': true, 'wicket': false},
        'four': {'runs': 4, 'legal_ball': true, 'wicket': false},
        'six': {'runs': 6, 'legal_ball': true, 'wicket': false},
        'wide': {'runs': 1, 'legal_ball': false, 'wicket': false},
        'no_ball': {'runs': 1, 'legal_ball': false, 'wicket': false},
        'wicket': {'runs': 0, 'legal_ball': true, 'wicket': true},
      },
      'draw_allowed': true,
      'overtime': {'policy': 'super_over'},
      'tie_break_order': ['h2h_points', 'h2h_diff', 'overall_diff', 'scored', 'fair_play', 'draw_lots'],
      'roster': {'min_squad_size': 11, 'max_squad_size': 18, 'required_positions': {'wicketkeeper': 1}},
    },
    {
      'sport_id': 'esports',
      'name': 'Esports',
      'scoring_model': 'round',
      'periods': {'best_of': 3},
      'scoring_events': {'round_win': {'rounds': 1}},
      'draw_allowed': false,
      'overtime': {'policy': 'none'},
      'tie_break_order': ['h2h_points', 'h2h_diff', 'overall_diff', 'scored', 'fair_play', 'draw_lots'],
      'roster': {'min_squad_size': 5, 'max_squad_size': 8, 'required_positions': {}},
    },
  ];

  // ── Mock fixtures generation (round-robin circle method) ───────────────
  Map<String, dynamic> _mockFixtures(Map<String, dynamic> body) {
    final format = body['format'] as String? ?? 'round_robin';
    final teams = (body['teams'] as List?)?.cast<String>() ?? ['t1', 't2', 't3', 't4'];
    final params = body['params'] as Map<String, dynamic>? ?? {};
    final legs = params['legs'] as int? ?? 1;

    if (format == 'round_robin') {
      final n = teams.length;
      final roundsPerLeg = n.isOdd ? n : n - 1;
      final totalRounds = roundsPerLeg * legs;
      final rounds = <Map<String, dynamic>>[];
      
      // Use nullable list for bye handling
      final teamsList = List<String?>.from(teams);
      if (teamsList.length.isOdd) teamsList.add(null); // bye placeholder

      for (var leg = 1; leg <= legs; leg++) {
        final rotation = List<String?>.from(teamsList);
        for (var r = 0; r < roundsPerLeg; r++) {
          final matches = <Map<String, dynamic>>[];
          final byes = <String>[];
          final m = rotation.length ~/ 2;
          for (var i = 0; i < m; i++) {
            final home = rotation[i];
            final away = rotation[rotation.length - 1 - i];
            if (home == null) { if (away != null) byes.add(away); continue; }
            if (away == null) { byes.add(home); continue; }
            matches.add({
              'match_id': 'RR-L$leg-R${r + 1}-M${i + 1}',
              'leg': leg,
              'home': home,
              'away': away,
              'status': 'scheduled',
              'awarded_to': null,
            });
          }
          rounds.add({
            'round': r + 1 + (leg - 1) * roundsPerLeg,
            'matches': matches,
            'byes': byes,
          });
          // rotate (circle method): keep first fixed, rotate rest
          if (rotation.length > 1) {
            final last = rotation.removeLast();
            rotation.insert(1, last);
          }
        }
      }
      final totalMatches = rounds.fold<int>(0, (s, r) => s + (r['matches'] as List).length);
      return {
        'format': 'round_robin',
        'legs': legs,
        'team_count': n,
        'round_count': totalRounds,
        'rounds': rounds,
        'summary': {'total': totalMatches, 'scheduled': totalMatches, 'forfeit': 0, 'voided': 0},
      };
    }

    // Fallback for other formats
    return {'format': format, 'rounds': [], 'bracket_size': teams.length};
  }

  // ── Mock standings: sport varies by league ─────────────────────────────
  static const _leagueSports = {
    'league-alpha-1': 'football',
    'league-alpha-2': 'basketball',
    'league-beta-1': 'cricket',
  };

  Map<String, dynamic> _mockStandings(String leagueId) {
    final sport = _leagueSports[leagueId] ?? 'football';
    switch (sport) {
      case 'basketball':
        return {
          'league_id': leagueId, 'sport_id': 'basketball', 'qualification_spots': 2,
          'table': [
            {'rank':1,'team_id':'Falcons','played':6,'won':5,'drawn':0,'lost':1,'scored':312,'conceded':288,'diff':24,'points':15,'fair_play':0,'status':'clinched','resolved_by':null},
            {'rank':2,'team_id':'Titans','played':6,'won':4,'drawn':0,'lost':2,'scored':298,'conceded':290,'diff':8,'points':12,'fair_play':0,'status':'clinched','resolved_by':null},
            {'rank':3,'team_id':'Hornets','played':6,'won':3,'drawn':0,'lost':3,'scored':275,'conceded':280,'diff':-5,'points':9,'fair_play':0,'status':'still_possible','resolved_by':null},
            {'rank':4,'team_id':'Knights','played':6,'won':2,'drawn':0,'lost':4,'scored':260,'conceded':295,'diff':-35,'points':6,'fair_play':0,'status':'still_possible','resolved_by':null},
            {'rank':5,'team_id':'Eagles','played':6,'won':0,'drawn':0,'lost':6,'scored':240,'conceded':332,'diff':-92,'points':0,'fair_play':0,'status':'eliminated','resolved_by':null},
          ],
          'h2h': {},
        };
      case 'cricket':
        return {
          'league_id': leagueId, 'sport_id': 'cricket', 'qualification_spots': 2,
          'table': [
            {'rank':1,'team_id':'Abbottabad XI','played':4,'won':3,'drawn':0,'lost':1,'scored':520,'conceded':480,'diff':2.105,'points':12,'fair_play':0,'status':'clinched','resolved_by':null},
            {'rank':2,'team_id':'Capital CC','played':4,'won':2,'drawn':1,'lost':1,'scored':490,'conceded':475,'diff':0.842,'points':11,'fair_play':0,'status':'clinched','resolved_by':null},
            {'rank':3,'team_id':'Rawalpindi Riders','played':4,'won':2,'drawn':0,'lost':2,'scored':475,'conceded':500,'diff':-1.250,'points':8,'fair_play':0,'status':'still_possible','resolved_by':null},
            {'rank':4,'team_id':'Lahore Lions','played':4,'won':1,'drawn':1,'lost':2,'scored':450,'conceded':510,'diff':-1.500,'points':5,'fair_play':-1,'status':'eliminated','resolved_by':null},
          ],
          'h2h': {},
        };
      default: // football
        return {
          'league_id': leagueId, 'sport_id': 'football', 'qualification_spots': 2,
          'table': [
            {'rank':1,'team_id':'Northside FC','played':8,'won':6,'drawn':1,'lost':1,'scored':18,'conceded':6,'diff':12,'points':19,'fair_play':0,'status':'clinched','resolved_by':null},
            {'rank':2,'team_id':'Riverside Utd','played':8,'won':5,'drawn':2,'lost':1,'scored':14,'conceded':7,'diff':7,'points':17,'fair_play':0,'status':'clinched','resolved_by':null},
            {'rank':3,'team_id':'Capital Athletic','played':8,'won':3,'drawn':2,'lost':3,'scored':10,'conceded':10,'diff':0,'points':11,'fair_play':0,'status':'still_possible','resolved_by':null},
            {'rank':4,'team_id':'Valley Rangers','played':8,'won':2,'drawn':1,'lost':5,'scored':8,'conceded':14,'diff':-6,'points':7,'fair_play':0,'status':'still_possible','resolved_by':null},
            {'rank':5,'team_id':'Eastside City','played':8,'won':0,'drawn':2,'lost':6,'scored':4,'conceded':17,'diff':-13,'points':2,'fair_play':0,'status':'eliminated','resolved_by':null},
          ],
          'h2h': {},
        };
    }
  }

  // ── Mock match registry: matchId → sport, teams, status, events ────────
  // Each match has a coherent event log that the score is derived from.
  static const _mockMatches = <String, Map<String, dynamic>>{
    'm1': {
      'sport_id': 'football', 'league_id': 'league-alpha-1',
      'home': 'Northside FC', 'away': 'Riverside Utd', 'status': 'in_progress',
    },
    'm2': {
      'sport_id': 'basketball', 'league_id': 'league-alpha-2',
      'home': 'Falcons', 'away': 'Titans', 'status': 'in_progress',
    },
    'm3': {
      'sport_id': 'cricket', 'league_id': 'league-beta-1',
      'home': 'Abbottabad XI', 'away': 'Capital CC', 'status': 'completed',
    },
    'm4': {
      'sport_id': 'esports', 'league_id': 'league-alpha-1',
      'home': 'Nova Five', 'away': 'Pixel Wolves', 'status': 'in_progress',
    },
  };

  // Pre-built event logs per match (coherent with the sport's scoring model)
  List<Map<String, dynamic>> _mockEvents(String matchId) {
    switch (matchId) {
      case 'm1': // football, in_progress, 2-1
        return [
          {'sequence':1,'event_id':'evt-001','type':'match_start','payload':{},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':2,'event_id':'evt-002','type':'score','payload':{'team_id':'Northside FC','event_type':'goal'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':3,'event_id':'evt-003','type':'score','payload':{'team_id':'Riverside Utd','event_type':'goal'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':4,'event_id':'evt-004','type':'score','payload':{'team_id':'Northside FC','event_type':'goal'},'signature':'demo','compensated':false,'compensated_by':null},
        ];
      case 'm2': // basketball, in_progress, 46-42 (Falcons lead)
        return [
          {'sequence':1,'event_id':'evt-010','type':'match_start','payload':{},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':2,'event_id':'evt-011','type':'score','payload':{'team_id':'Falcons','event_type':'two_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':3,'event_id':'evt-012','type':'score','payload':{'team_id':'Titans','event_type':'three_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':4,'event_id':'evt-013','type':'score','payload':{'team_id':'Falcons','event_type':'free_throw'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':5,'event_id':'evt-014','type':'score','payload':{'team_id':'Titans','event_type':'two_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':6,'event_id':'evt-015','type':'score','payload':{'team_id':'Falcons','event_type':'three_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':7,'event_id':'evt-016','type':'score','payload':{'team_id':'Falcons','event_type':'three_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':8,'event_id':'evt-017','type':'score','payload':{'team_id':'Titans','event_type':'two_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':9,'event_id':'evt-018','type':'score','payload':{'team_id':'Falcons','event_type':'two_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':10,'event_id':'evt-019','type':'score','payload':{'team_id':'Titans','event_type':'three_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':11,'event_id':'evt-020','type':'score','payload':{'team_id':'Falcons','event_type':'three_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':12,'event_id':'evt-021','type':'score','payload':{'team_id':'Titans','event_type':'two_pointer'},'signature':'demo','compensated':false,'compensated_by':null},
        ];
      case 'm3': // cricket, completed, home 18/1 (1.2 ov) — away 19/1 (1.4 ov), away wins
        return [
          {'sequence':1,'event_id':'evt-030','type':'match_start','payload':{},'signature':'demo','compensated':false,'compensated_by':null},
          // Home innings (Abbottabad XI): 18 runs, 1 wicket, 8 legal balls → 1.2 overs
          {'sequence':2,'event_id':'evt-031','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'single'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':3,'event_id':'evt-032','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'four'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':4,'event_id':'evt-033','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'six'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':5,'event_id':'evt-034','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'wicket'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':6,'event_id':'evt-035','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'two'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':7,'event_id':'evt-036','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'dot_ball'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':8,'event_id':'evt-037','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'four'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':9,'event_id':'evt-038','type':'score','payload':{'team_id':'Abbottabad XI','event_type':'single'},'signature':'demo','compensated':false,'compensated_by':null},
          // Away innings (Capital CC): 19 runs, 1 wicket, 10 legal balls → 1.4 overs
          {'sequence':10,'event_id':'evt-039','type':'score','payload':{'team_id':'Capital CC','event_type':'single'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':11,'event_id':'evt-040','type':'score','payload':{'team_id':'Capital CC','event_type':'single'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':12,'event_id':'evt-041','type':'score','payload':{'team_id':'Capital CC','event_type':'four'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':13,'event_id':'evt-042','type':'score','payload':{'team_id':'Capital CC','event_type':'dot_ball'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':14,'event_id':'evt-043','type':'score','payload':{'team_id':'Capital CC','event_type':'six'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':15,'event_id':'evt-044','type':'score','payload':{'team_id':'Capital CC','event_type':'two'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':16,'event_id':'evt-045','type':'score','payload':{'team_id':'Capital CC','event_type':'wicket'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':17,'event_id':'evt-046','type':'score','payload':{'team_id':'Capital CC','event_type':'dot_ball'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':18,'event_id':'evt-047','type':'score','payload':{'team_id':'Capital CC','event_type':'four'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':19,'event_id':'evt-048','type':'score','payload':{'team_id':'Capital CC','event_type':'single'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':20,'event_id':'evt-049','type':'match_end','payload':{},'signature':'demo','compensated':false,'compensated_by':null},
        ];
      case 'm4': // esports, in_progress, 2-1 (best of 3, home leads)
        return [
          {'sequence':1,'event_id':'evt-060','type':'match_start','payload':{},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':2,'event_id':'evt-061','type':'score','payload':{'team_id':'Pixel Wolves','event_type':'round_win'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':3,'event_id':'evt-062','type':'score','payload':{'team_id':'Nova Five','event_type':'round_win'},'signature':'demo','compensated':false,'compensated_by':null},
          {'sequence':4,'event_id':'evt-063','type':'score','payload':{'team_id':'Nova Five','event_type':'round_win'},'signature':'demo','compensated':false,'compensated_by':null},
        ];
      default:
        return [];
    }
  }

  Map<String, dynamic> _mockScore(String matchId) {
    final meta = _mockMatches[matchId];
    if (meta == null) {
      // Unknown match — return a generic upcoming match
      return {
        'match_id': matchId, 'sport_id': 'football', 'league_id': null,
        'status': 'upcoming', 'outcome': 'pending',
        'winner_team_id': null, 'tiebreak_winner_team_id': null,
        'home': {'team_id': 'Home', 'score': 0, 'wickets': null, 'balls': null, 'overs': null, 'fair_play': 0},
        'away': {'team_id': 'Away', 'score': 0, 'wickets': null, 'balls': null, 'overs': null, 'fair_play': 0},
        'version': 0, 'events': [],
      };
    }

    final sportId = meta['sport_id'] as String;
    final homeTeam = meta['home'] as String;
    final awayTeam = meta['away'] as String;
    final status = meta['status'] as String;
    final events = _mockEvents(matchId);

    // Project score from events (mirrors the backend scoreService logic)
    int homeScore = 0, awayScore = 0;
    int? homeWickets, awayWickets, homeBalls, awayBalls;
    String? homeOvers, awayOvers;
    int homeFairPlay = 0, awayFairPlay = 0;
    String? tiebreakWinner;

    if (sportId == 'cricket') {
      homeWickets = 0; awayWickets = 0; homeBalls = 0; awayBalls = 0;
    }

    final sportsConfig = _mockSports();
    final sportConfig = sportsConfig.firstWhere((s) => s['sport_id'] == sportId, orElse: () => sportsConfig[0]);
    final model = sportConfig['scoring_model'] as String;
    final scoringEvents = sportConfig['scoring_events'] as Map<String, dynamic>;
    final bpo = (sportConfig['periods'] as Map)['balls_per_over'] as int? ?? 6;

    for (final ev in events) {
      final type = ev['type'] as String;
      final payload = ev['payload'] as Map<String, dynamic>;
      final isHome = payload['team_id'] == homeTeam;
      if (type == 'score') {
        final eventDef = scoringEvents[payload['event_type']] as Map<String, dynamic>? ?? {};
        if (model == 'event') {
          if (isHome) homeScore += (eventDef['points'] as int? ?? 0); else awayScore += (eventDef['points'] as int? ?? 0);
        } else if (model == 'innings') {
          if (isHome) {
            homeScore += (eventDef['runs'] as int? ?? 0);
            if (eventDef['legal_ball'] == true) homeBalls = homeBalls! + 1;
            if (eventDef['wicket'] == true) homeWickets = homeWickets! + 1;
          } else {
            awayScore += (eventDef['runs'] as int? ?? 0);
            if (eventDef['legal_ball'] == true) awayBalls = awayBalls! + 1;
            if (eventDef['wicket'] == true) awayWickets = awayWickets! + 1;
          }
        } else if (model == 'round') {
          if (isHome) homeScore += (eventDef['rounds'] as int? ?? 0); else awayScore += (eventDef['rounds'] as int? ?? 0);
        }
      } else if (type == 'discipline') {
        if (isHome) homeFairPlay += (payload['points'] as int? ?? 0); else awayFairPlay += (payload['points'] as int? ?? 0);
      } else if (type == 'tiebreak_winner') {
        tiebreakWinner = payload['team_id'] as String?;
      }
    }

    if (model == 'innings') {
      homeOvers = '${homeBalls! ~/ bpo}.${homeBalls! % bpo}';
      awayOvers = '${awayBalls! ~/ bpo}.${awayBalls! % bpo}';
    }

    // Determine outcome
    String outcome = 'pending';
    String? winner;
    if (status == 'completed') {
      if (homeScore > awayScore) { outcome = 'home_win'; winner = homeTeam; }
      else if (awayScore > homeScore) { outcome = 'away_win'; winner = awayTeam; }
      else if (tiebreakWinner != null) { outcome = tiebreakWinner == homeTeam ? 'home_win' : 'away_win'; winner = tiebreakWinner; }
      else if (sportConfig['draw_allowed'] == true) { outcome = 'draw'; }
      else { outcome = 'undecided'; }
    }

    return {
      'match_id': matchId,
      'sport_id': sportId,
      'league_id': meta['league_id'],
      'status': status,
      'outcome': outcome,
      'winner_team_id': winner,
      'tiebreak_winner_team_id': tiebreakWinner,
      'home': {'team_id': homeTeam, 'score': homeScore, 'wickets': homeWickets, 'balls': homeBalls, 'overs': homeOvers, 'fair_play': homeFairPlay},
      'away': {'team_id': awayTeam, 'score': awayScore, 'wickets': awayWickets, 'balls': awayBalls, 'overs': awayOvers, 'fair_play': awayFairPlay},
      'version': events.length,
      'events': events,
    };
  }

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
