import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';

class StandingsScreen extends StatefulWidget {
  const StandingsScreen({super.key});
  @override
  State<StandingsScreen> createState() => _StandingsScreenState();
}

class _StandingsScreenState extends State<StandingsScreen> {
  String _leagueId = 'league-alpha-1';
  bool _loading = false;
  bool _offline = false;
  Map<String, dynamic>? _data;
  bool _showH2H = false;

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
        final data = await ApiClient().getStandings(_leagueId);
        await state.cacheData('standings_$_leagueId', data);
        setState(() { _data = data; _offline = false; });
      } catch (_) {
        _loadCache(state);
      }
    } else {
      _loadCache(state);
    }
    setState(() => _loading = false);
  }

  void _loadCache(AppState state) {
    final cached = state.getCached('standings_$_leagueId');
    if (cached != null) {
      _data = Map<String, dynamic>.from(cached['data'] as Map);
      _offline = true;
    } else {
      _data = _seedData();
      _offline = true;
    }
  }

  Map<String, dynamic> _seedData() => {
    'league_id': _leagueId, 'sport_id': 'football', 'qualification_spots': 2,
    'table': [
      {'rank':1,'team_id':'Northside FC','played':6,'won':5,'drawn':1,'lost':0,'scored':16,'conceded':4,'diff':12,'points':16,'fair_play':0,'status':'clinched'},
      {'rank':2,'team_id':'Riverside Utd','played':6,'won':4,'drawn':1,'lost':1,'scored':11,'conceded':5,'diff':6,'points':13,'fair_play':0,'status':'clinched'},
      {'rank':3,'team_id':'Capital AC','played':6,'won':2,'drawn':2,'lost':2,'scored':8,'conceded':9,'diff':-1,'points':8,'fair_play':0,'status':'still_possible'},
      {'rank':4,'team_id':'Valley Rangers','played':6,'won':1,'drawn':1,'lost':4,'scored':5,'conceded':12,'diff':-7,'points':4,'fair_play':0,'status':'still_possible'},
      {'rank':5,'team_id':'Eastside City','played':6,'won':0,'drawn':1,'lost':5,'scored':3,'conceded':13,'diff':-10,'points':1,'fair_play':0,'status':'eliminated'},
    ],
    'h2h': {},
  };

  String _diffLabel(String sportId) {
    switch (sportId) {
      case 'cricket': return 'NRR';
      case 'esports': return 'MD';
      default: return 'GD';
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final table = data != null ? (data['table'] as List?) ?? [] : [];
    final sportId = data?['sport_id'] as String? ?? 'football';
    final qualSpots = data?['qualification_spots'] as int? ?? 2;

    return RefreshIndicator(
      color: kGold, backgroundColor: kSurface,
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        if (_offline) OfflineBanner(),
        const SizedBox(height: 8),
        const Eyebrow('League Table'),
        const SizedBox(height: 6),
        const HeadlineText('Standings'),
        const SizedBox(height: 14),

        // League picker
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
                child: Text(l, style: TextStyle(color: _leagueId == l ? kGold : kMuted, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            ),
          )).toList()),
        ),
        const SizedBox(height: 12),

        // Summary row
        if (data != null) Row(children: [
          Expanded(child: Panel(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${table.length}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: kGold)),
            const Text('TEAMS', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
          ]))),
          const SizedBox(width: 10),
          Expanded(child: Panel(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('$qualSpots', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: kGold)),
            const Text('QUALIFY', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
          ]))),
          const SizedBox(width: 10),
          Expanded(child: Panel(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(sportId.toUpperCase(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: kGold)),
            const Text('SPORT', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
          ]))),
        ]),
        const SizedBox(height: 14),

        if (_loading) const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: kGold)))
        else if (table.isEmpty) const EmptyState(icon: Icons.leaderboard_outlined, title: 'No standings yet', subtitle: 'Register a league with fixtures to generate the table.')
        else Panel(
          padding: const EdgeInsets.all(0),
          child: Column(children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
              child: Row(children: [
                const SizedBox(width: 28, child: Text('#', style: TextStyle(color: kMuted, fontSize: 10, fontWeight: FontWeight.w700))),
                const Expanded(child: Text('CLUB', style: TextStyle(color: kMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1))),
                _col('P'),
                _col('W'),
                _col('D'),
                _col('L'),
                _col(_diffLabel(sportId)),
                _col('PTS', bold: true),
              ]),
            ),
            const Divider(color: kBorder, height: 1),
            ...table.asMap().entries.map((e) {
              final row = e.value as Map<String, dynamic>;
              final isTop = (row['rank'] as int? ?? 99) <= qualSpots;
              return Container(
                decoration: BoxDecoration(
                  color: isTop ? kGold.withValues(alpha: 0.04) : null,
                  border: e.key < table.length - 1 ? const Border(bottom: BorderSide(color: kBorder)) : null,
                ),
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Row(children: [
                  SizedBox(width: 28, child: Text(
                    '${row['rank']}',
                    style: TextStyle(
                      color: (row['rank'] as int? ?? 99) == 1 ? kGold : kMuted,
                      fontWeight: FontWeight.w900, fontSize: 13,
                    ),
                  )),
                  Expanded(child: Row(children: [
                    TeamAvatar(row['team_id'] as String? ?? '', size: 28,
                        color: isTop ? kGold : Colors.lightBlueAccent),
                    const SizedBox(width: 8),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(row['team_id'] as String? ?? '',
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                      QualBadge(row['status'] as String? ?? ''),
                    ])),
                  ])),
                  _cell('${row['played']}'),
                  _cell('${row['won']}'),
                  _cell('${row['drawn']}'),
                  _cell('${row['lost']}'),
                  _cell('${row['diff']}'),
                  _cell('${row['points']}', gold: true),
                ]),
              );
            }),
          ]),
        ),

        const SizedBox(height: 16),
        // H2H toggle
        if (data != null) ...[
          GestureDetector(
            onTap: () => setState(() => _showH2H = !_showH2H),
            child: Panel(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(children: [
                  const Text('Head-to-Head Matrix', style: TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Icon(_showH2H ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: kMuted),
                ])),
          ),
          if (_showH2H) ...[
            const SizedBox(height: 8),
            Panel(child: const Text('H2H data available via API.\nTable: rows = attacker, columns = defender.',
                style: TextStyle(color: kMuted, fontSize: 12, height: 1.5))),
          ],
        ],
      ]),
    );
  }

  Widget _col(String t, {bool bold = false}) => SizedBox(
    width: 30,
    child: Text(t, textAlign: TextAlign.center,
        style: TextStyle(color: kMuted, fontSize: 10, fontWeight: bold ? FontWeight.w900 : FontWeight.w700, letterSpacing: 0.5)),
  );

  Widget _cell(String t, {bool gold = false}) => SizedBox(
    width: 30,
    child: Text(t, textAlign: TextAlign.center,
        style: TextStyle(color: gold ? kGold : kText, fontSize: 12, fontWeight: gold ? FontWeight.w900 : FontWeight.w600)),
  );
}
