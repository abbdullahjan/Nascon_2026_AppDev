import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';
import 'match_detail_screen.dart';

class FixturesScreen extends StatefulWidget {
  const FixturesScreen({super.key});
  @override
  State<FixturesScreen> createState() => _FixturesScreenState();
}

class _FixturesScreenState extends State<FixturesScreen> {
  String _filter = 'All';
  String _leagueId = 'league-alpha-1';
  bool _loading = false;
  bool _offline = false;
  String? _lastUpdated;
  List<Map<String, dynamic>> _fixtures = [];

  static const _leagues = ['league-alpha-1', 'league-alpha-2', 'league-beta-1'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final state = AppStateScope.of(context);
    setState(() => _loading = true);

    if (state.online) {
      try {
        // Fetch from standings to get fixture list; or use cached league config
        final leagueData = await ApiClient().get('/audit/v1/standings/$_leagueId');
        final fixtures = _extractFixtures(leagueData);
        await state.cacheData('fixtures_$_leagueId', fixtures);
        setState(() { _fixtures = fixtures; _offline = false; _lastUpdated = _now(); });
      } catch (_) {
        _loadCache(state);
      }
    } else {
      _loadCache(state);
    }
    setState(() => _loading = false);
  }

  void _loadCache(AppState state) {
    final cached = state.getCached('fixtures_$_leagueId');
    if (cached != null) {
      final data = cached['data'];
      if (data is List) {
        _fixtures = data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      _lastUpdated = _formatTs(cached['ts'] as String?);
      _offline = true;
    } else {
      _fixtures = _seedFixtures();
      _offline = true;
    }
  }

  List<Map<String, dynamic>> _extractFixtures(Map<String, dynamic> data) {
    // standings response has table — build a fake fixture list from team names
    final table = (data['table'] as List?) ?? [];
    return table.asMap().entries.map((e) => {
      'match_id': 'm${e.key + 1}',
      'home': e.value['team_id'],
      'away': table[(e.key + 1) % table.length]['team_id'],
      'status': 'upcoming',
      'sport': data['sport_id'] ?? 'football',
      'time': '19:00',
    }).toList();
  }

  List<Map<String, dynamic>> _seedFixtures() => [
    {'match_id': 'm1', 'home': 'Northside FC', 'away': 'Riverside United', 'status': 'in_progress', 'sport': 'football', 'time': '18:30'},
    {'match_id': 'm2', 'home': 'Falcons', 'away': 'Titans', 'status': 'upcoming', 'sport': 'basketball', 'time': '19:00'},
    {'match_id': 'm3', 'home': 'Abbottabad XI', 'away': 'Capital CC', 'status': 'completed', 'sport': 'cricket', 'time': '14:00'},
    {'match_id': 'm4', 'home': 'Nova Five', 'away': 'Pixel Wolves', 'status': 'upcoming', 'sport': 'esports', 'time': '20:00'},
  ];

  String _now() => _formatTs(DateTime.now().toIso8601String());
  String _formatTs(String? ts) {
    if (ts == null) return 'unknown';
    try {
      final dt = DateTime.parse(ts).toLocal();
      return '${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
    } catch (_) { return ts; }
  }

  List<Map<String, dynamic>> get _visible {
    if (_filter == 'All') return _fixtures;
    return _fixtures.where((f) => (f['status'] as String?)?.toLowerCase() == _filter.toLowerCase()).toList();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: kGold, backgroundColor: kSurface,
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        if (_offline) OfflineBanner(lastUpdated: _lastUpdated),
        const SizedBox(height: 8),
        const Eyebrow('Matchday'),
        const SizedBox(height: 6),
        const HeadlineText('Fixtures'),
        const SizedBox(height: 4),
        const Text('All matches across leagues', style: TextStyle(color: kMuted, fontSize: 12)),
        const SizedBox(height: 14),
        // League selector
        SizedBox(
          height: 34,
          child: ListView(scrollDirection: Axis.horizontal, children: _leagues.map((l) => Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () { setState(() => _leagueId = l); _load(); },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: _leagueId == l ? kGold.withValues(alpha: 0.15) : kSurface2,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _leagueId == l ? kGold.withValues(alpha: 0.5) : kBorder),
                ),
                child: Text(l, style: TextStyle(
                  color: _leagueId == l ? kGold : kMuted,
                  fontSize: 11, fontWeight: FontWeight.w700,
                )),
              ),
            ),
          )).toList()),
        ),
        const SizedBox(height: 12),
        // Status filter chips
        Wrap(spacing: 8, children: ['All', 'upcoming', 'in_progress', 'completed'].map((s) => ChoiceChip(
          label: Text(s == 'All' ? s : matchStatusLabel(s)),
          selected: _filter == s,
          onSelected: (_) => setState(() => _filter = s),
          selectedColor: kGold.withValues(alpha: 0.15),
          labelStyle: TextStyle(
            color: _filter == s ? kGold : kMuted,
            fontWeight: FontWeight.w700, fontSize: 11,
          ),
          side: BorderSide(color: _filter == s ? kGold.withValues(alpha: 0.5) : kBorder),
          backgroundColor: kSurface2,
        )).toList()),
        const SizedBox(height: 14),
        if (_loading)
          const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: kGold)))
        else if (_visible.isEmpty)
          const EmptyState(icon: Icons.event_busy_rounded, title: 'No matches found', subtitle: 'Try a different status filter or league.')
        else
          ..._visible.map((f) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _FixtureCard(fixture: f,
                onTap: () => Navigator.push(context, MaterialPageRoute(
                    builder: (_) => MatchDetailScreen(matchId: f['match_id'] as String, fixture: f)))),
          )),
      ]),
    );
  }
}

// ── Fixture Card ───────────────────────────────────────────────────────────
class _FixtureCard extends StatelessWidget {
  const _FixtureCard({required this.fixture, required this.onTap});
  final Map<String, dynamic> fixture;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final status = fixture['status'] as String? ?? 'upcoming';
    final color = matchStatusColor(status);
    final isLive = status == 'in_progress';
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Panel(
        padding: const EdgeInsets.all(14),
        child: Column(children: [
          Row(children: [
            Text((fixture['sport'] as String? ?? '').toUpperCase(),
                style: const TextStyle(color: kMuted, fontSize: 9, letterSpacing: 1.5, fontWeight: FontWeight.w800)),
            const Spacer(),
            if (isLive) ...[const LiveDot(), const SizedBox(width: 6)],
            StatusBadge(matchStatusLabel(status), color: color),
          ]),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: Column(children: [
              TeamAvatar(fixture['home'] as String? ?? '?'),
              const SizedBox(height: 8),
              Text(fixture['home'] as String? ?? '',
                  textAlign: TextAlign.center,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            ])),
            Column(children: [
              Text(
                status == 'completed'
                    ? '${fixture['home_score'] ?? 0}  —  ${fixture['away_score'] ?? 0}'
                    : isLive
                        ? '${fixture['home_score'] ?? 0}  —  ${fixture['away_score'] ?? 0}'
                        : 'VS',
                style: TextStyle(
                  fontSize: status == 'upcoming' ? 13 : 22,
                  fontWeight: FontWeight.w900,
                  color: status == 'upcoming' ? kMuted : kText,
                  letterSpacing: 1,
                ),
              ),
              if (status == 'upcoming') ...[
                const SizedBox(height: 4),
                Text(fixture['time'] as String? ?? '',
                    style: const TextStyle(color: kGold, fontSize: 11, fontWeight: FontWeight.w700)),
              ],
            ]),
            Expanded(child: Column(children: [
              TeamAvatar(fixture['away'] as String? ?? '?', color: Colors.lightBlueAccent),
              const SizedBox(height: 8),
              Text(fixture['away'] as String? ?? '',
                  textAlign: TextAlign.center,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            ])),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            const Icon(Icons.arrow_forward_rounded, size: 14, color: kMuted),
            const SizedBox(width: 4),
            Text('Tap to open', style: const TextStyle(color: kMuted, fontSize: 10)),
            const Spacer(),
            Text(fixture['match_id'] as String? ?? '',
                style: const TextStyle(color: kBorder, fontSize: 10)),
          ]),
        ]),
      ),
    );
  }
}
