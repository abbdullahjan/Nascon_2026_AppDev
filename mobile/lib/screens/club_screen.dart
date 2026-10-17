import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';

class ClubScreen extends StatefulWidget {
  const ClubScreen({super.key});
  @override
  State<ClubScreen> createState() => _ClubScreenState();
}

class _ClubScreenState extends State<ClubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  bool _loading = false;
  bool _offline = false;
  Map<String, dynamic>? _data;

  // Demo rosters — replaced by real data when available (multi-sport, multi-team)
  static final _allTeams = {
    'Northside FC': {
      'sport': 'football',
      'roster': [
        {'name': 'Ali Hassan', 'position': 'GK', 'role': 'captain', 'id': 'player-alpha-1'},
        {'name': 'Bilal Khan', 'position': 'DF', 'role': 'starter', 'id': 'player-alpha-2'},
        {'name': 'Omar Malik', 'position': 'MF', 'role': 'starter', 'id': 'p3'},
        {'name': 'Saad Ahmed', 'position': 'FW', 'role': 'vice_captain', 'id': 'p4'},
      ],
    },
    'Riverside Utd': {
      'sport': 'football',
      'roster': [
        {'name': 'Hamza Ali', 'position': 'GK', 'role': 'captain', 'id': 'p10'},
        {'name': 'Faisal Shah', 'position': 'DF', 'role': 'starter', 'id': 'p11'},
        {'name': 'Zain Tariq', 'position': 'MF', 'role': 'starter', 'id': 'p12'},
      ],
    },
    'Falcons': {
      'sport': 'basketball',
      'roster': [
        {'name': 'Hassan Raza', 'position': 'PG', 'role': 'captain', 'id': 'b1'},
        {'name': 'Ahmed Malik', 'position': 'SG', 'role': 'starter', 'id': 'b2'},
        {'name': 'Usman Khan', 'position': 'SF', 'role': 'starter', 'id': 'b3'},
      ],
    },
    'Titans': {
      'sport': 'basketball',
      'roster': [
        {'name': 'Ali Qureshi', 'position': 'PG', 'role': 'captain', 'id': 'b10'},
        {'name': 'Saad Jamil', 'position': 'C', 'role': 'starter', 'id': 'b11'},
      ],
    },
    'Abbottabad XI': {
      'sport': 'cricket',
      'roster': [
        {'name': 'Babar Khan', 'position': 'Batsman', 'role': 'captain', 'id': 'c1'},
        {'name': 'Shaheen Shah', 'position': 'Bowler', 'role': 'starter', 'id': 'c2'},
        {'name': 'Rizwan Ali', 'position': 'WK', 'role': 'starter', 'id': 'c3'},
      ],
    },
    'Capital CC': {
      'sport': 'cricket',
      'roster': [
        {'name': 'Imran Ahmed', 'position': 'All-rounder', 'role': 'captain', 'id': 'c10'},
        {'name': 'Wasim Akram', 'position': 'Bowler', 'role': 'starter', 'id': 'c11'},
      ],
    },
    'Nova Five': {
      'sport': 'esports',
      'roster': [
        {'name': 'CyberAce', 'position': 'IGL', 'role': 'captain', 'id': 'e1'},
        {'name': 'SharpShooter', 'position': 'AWP', 'role': 'starter', 'id': 'e2'},
        {'name': 'FlashMaster', 'position': 'Entry', 'role': 'starter', 'id': 'e3'},
      ],
    },
    'Pixel Wolves': {
      'sport': 'esports',
      'roster': [
        {'name': 'ShadowKing', 'position': 'IGL', 'role': 'captain', 'id': 'e10'},
        {'name': 'QuickScope', 'position': 'Rifler', 'role': 'starter', 'id': 'e11'},
      ],
    },
  };

  String _selectedTeam = 'Northside FC';
  List<Map<String, dynamic>> get _roster => 
      (_allTeams[_selectedTeam]?['roster'] as List?)?.cast<Map<String, dynamic>>() ?? [];
  String get _teamSport => _allTeams[_selectedTeam]?['sport'] as String? ?? 'football';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    final state = AppStateScope.of(context);
    setState(() => _loading = true);
    if (state.online) {
      try {
        // Try to get club data from standings for now
        final standings = await ApiClient().getStandings('league-alpha-1');
        await state.cacheData('club_alpha-1', {'club': 'club-alpha-1', 'standings': standings});
        setState(() { _data = standings; _offline = false; });
      } catch (_) { _loadCache(state); }
    } else {
      _loadCache(state);
    }
    setState(() => _loading = false);
  }

  void _loadCache(AppState state) {
    final cached = state.getCached('club_alpha-1');
    if (cached != null) {
      _data = Map<String, dynamic>.from(cached['data'] as Map);
      _offline = true;
    } else {
      _offline = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return RefreshIndicator(
      color: kGold, backgroundColor: kSurface,
      onRefresh: _load,
      child: NestedScrollView(
        headerSliverBuilder: (context, inner) => [
          SliverToBoxAdapter(child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (_offline) OfflineBanner(),
              const SizedBox(height: 8),
              const Eyebrow('Club Portal'),
              const SizedBox(height: 6),
              const HeadlineText('Club Profile'),
              const SizedBox(height: 14),
              // Club header
              Panel(child: Row(children: [
                Container(
                  width: 64, height: 64,
                  decoration: BoxDecoration(
                    color: kGold.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: kGold.withValues(alpha: 0.3)),
                  ),
                  child: const Icon(Icons.shield_rounded, color: kGold, size: 34),
                ),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_selectedTeam, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 2),
                  const Text('Alpha Sports · Multi-Sport', style: TextStyle(color: kMuted, fontSize: 11)),
                  const SizedBox(height: 6),
                  Row(children: [
                    const StatusBadge('ACTIVE', color: kGreen),
                    const SizedBox(width: 8),
                    StatusBadge(_teamSport.toUpperCase()),
                  ]),
                ])),
              ])),
              const SizedBox(height: 10),
              // Team selector
              SizedBox(
                height: 34,
                child: ListView(scrollDirection: Axis.horizontal, children: _allTeams.keys.map((t) => Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () => setState(() => _selectedTeam = t),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: _selectedTeam == t ? kGold.withValues(alpha: 0.15) : kSurface2,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: _selectedTeam == t ? kGold.withValues(alpha: 0.5) : kBorder),
                      ),
                      child: Text(t, style: TextStyle(color: _selectedTeam == t ? kGold : kMuted, fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                  ),
                )).toList()),
              ),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: Panel(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('12', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: kGold)),
                  const Text('PLAYERS', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
                ]))),
                const SizedBox(width: 8),
                Expanded(child: Panel(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('8', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: kGold)),
                  const Text('WINS', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
                ]))),
                const SizedBox(width: 8),
                Expanded(child: Panel(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('2', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: kGold)),
                  const Text('TROPHIES', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
                ]))),
              ]),
              const SizedBox(height: 10),
              Panel(padding: const EdgeInsets.all(12), child: Row(children: [
                const Icon(Icons.location_on_outlined, color: kGold, size: 18),
                const SizedBox(width: 8),
                const Expanded(child: Text('Northside Sports Complex · Islamabad · 33.7°N 73.0°E',
                    style: TextStyle(color: kMuted, fontSize: 11))),
              ])),
              const SizedBox(height: 12),
            ]),
          )),
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarDelegate(TabBar(
              controller: _tabs,
              labelColor: kGold,
              unselectedLabelColor: kMuted,
              indicatorColor: kGold,
              indicatorWeight: 2,
              dividerColor: kBorder,
              tabs: const [Tab(text: 'Roster'), Tab(text: 'Staff'), Tab(text: 'Stats')],
            )),
          ),
        ],
        body: TabBarView(controller: _tabs, children: [
          // ── Roster tab
          ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 80), children: [
            SectionTitle('Squad (${_roster.length}/25)',
                trailing: state.isManager
                    ? GestureDetector(
                        onTap: () => _showTransferSheet(context, state),
                        child: const StatusBadge('MANAGE', color: kGold))
                    : null),
            const SizedBox(height: 10),
            ..._roster.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _PlayerCard(player: p, canManage: state.isManager,
                  onManage: () => _showTransferSheet(context, state, playerId: p['id'])),
            )),
            if (!state.isManager)
              const Panel(child: Text('Roster management is available to Club Managers.\nSign in with manager@nascon.test.',
                  style: TextStyle(color: kMuted, fontSize: 12, height: 1.5))),
          ]),
          // ── Staff tab
          ListView(padding: const EdgeInsets.all(16), children: [
            ...[
              ('Hassan Raza', 'Head Coach', Icons.sports_rounded),
              ('Ahmad Siddiqui', 'Assistant Coach', Icons.sports_rounded),
              ('Dr. Sara Ali', 'Team Physio', Icons.medical_services_outlined),
              ('Kamran Iqbal', 'Club Manager', Icons.manage_accounts_rounded),
            ].map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(padding: const EdgeInsets.all(12), child: Row(children: [
                Container(width: 40, height: 40,
                  decoration: BoxDecoration(color: kSurface2, shape: BoxShape.circle),
                  child: Icon(s.$3, color: kMuted, size: 20)),
                const SizedBox(width: 12),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.$1, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(s.$2, style: const TextStyle(color: kMuted, fontSize: 11)),
                ]),
              ])),
            )),
          ]),
          // ── Stats tab
          ListView(padding: const EdgeInsets.all(16), children: [
            const SectionTitle('Season Statistics'),
            const SizedBox(height: 10),
            ...[
              ('Matches Played', '12'), ('Wins', '8'), ('Draws', '2'), ('Losses', '2'),
              ('Goals Scored', '24'), ('Goals Conceded', '10'), ('Clean Sheets', '5'),
            ].map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(children: [
                  Text(s.$1, style: const TextStyle(color: kMuted, fontSize: 13)),
                  const Spacer(),
                  Text(s.$2, style: const TextStyle(fontWeight: FontWeight.w900, color: kGold, fontSize: 16)),
                ])),
            )),
          ]),
        ]),
      ),
    );
  }

  Future<void> _showTransferSheet(BuildContext context, AppState state, {String? playerId}) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kSurface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _TransferSheet(playerId: playerId ?? 'player-alpha-1', state: state),
    );
  }
}

class _PlayerCard extends StatelessWidget {
  const _PlayerCard({required this.player, required this.canManage, required this.onManage});
  final Map<String, dynamic> player;
  final bool canManage;
  final VoidCallback onManage;
  @override
  Widget build(BuildContext context) {
    final role = player['role'] as String;
    Color roleColor = kMuted;
    if (role == 'captain') roleColor = kGold;
    else if (role == 'vice_captain') roleColor = kGoldLight;
    return Panel(padding: const EdgeInsets.all(12), child: Row(children: [
      TeamAvatar(player['name'] as String, size: 40),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(player['name'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
        Text(player['position'] as String, style: const TextStyle(color: kMuted, fontSize: 11)),
      ])),
      StatusBadge(role.replaceAll('_', ' ').toUpperCase(), color: roleColor),
      if (canManage) ...[
        const SizedBox(width: 8),
        GestureDetector(
          onTap: onManage,
          child: Container(
            width: 30, height: 30,
            decoration: BoxDecoration(color: kSurface2, borderRadius: BorderRadius.circular(8), border: Border.all(color: kBorder)),
            child: const Icon(Icons.more_horiz_rounded, color: kMuted, size: 16),
          ),
        ),
      ],
    ]));
  }
}

class _TransferSheet extends StatefulWidget {
  const _TransferSheet({required this.playerId, required this.state});
  final String playerId;
  final AppState state;
  @override
  State<_TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends State<_TransferSheet> {
  String _type = 'transfer';
  final _toSquad = TextEditingController(text: 'sq-b');
  final _reason = TextEditingController(text: 'Tactical decision');
  bool _loading = false;

  @override
  void dispose() { _toSquad.dispose(); _reason.dispose(); super.dispose(); }

  Future<void> _submit() async {
    setState(() => _loading = true);
    final body = {
      'league_id': 'lg-r1',
      'player_id': widget.playerId,
      'type': _type,
      'from_squad_id': 'sq-a',
      'to_squad_id': _type == 'release' ? null : _toSquad.text.trim(),
      'effective_date': DateTime.now().toIso8601String().substring(0, 10),
      'loan_end_date': null,
      'reason': _reason.text.trim(),
      'requested_by': widget.state.userName,
    };
    if (widget.state.online) {
      try {
        await ApiClient().postTransfer(body);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer complete ✓')));
          Navigator.pop(context);
        }
      } catch (e) {
        final msg = ApiClient.errorMessage(e);
        if (mounted) {
          setState(() => _loading = false);
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: kRed));
        }
      }
    } else {
      await widget.state.queueRosterTransfer(body, 0);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer queued for sync')));
        Navigator.pop(context);
      }
    }
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Player Action', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text('Player: ${widget.playerId}', style: const TextStyle(color: kMuted, fontSize: 12)),
          const SizedBox(height: 16),
          // Type selector
          Row(children: ['transfer', 'loan', 'release'].map((t) => Expanded(child: Padding(
            padding: const EdgeInsets.only(right: 6),
            child: GestureDetector(
              onTap: () => setState(() => _type = t),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: _type == t ? kGold.withValues(alpha: 0.15) : kSurface2,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _type == t ? kGold.withValues(alpha: 0.5) : kBorder),
                ),
                child: Text(t.toUpperCase(), textAlign: TextAlign.center,
                    style: TextStyle(color: _type == t ? kGold : kMuted, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            ),
          ))).toList()),
          const SizedBox(height: 12),
          if (_type != 'release') ...[
            TextField(controller: _toSquad, decoration: const InputDecoration(labelText: 'To Squad ID', prefixIcon: Icon(Icons.group_rounded))),
            const SizedBox(height: 10),
          ],
          TextField(controller: _reason, decoration: const InputDecoration(labelText: 'Reason', prefixIcon: Icon(Icons.notes_rounded))),
          const SizedBox(height: 16),
          PrimaryButton(label: 'Submit ${_type.capitalize}', onPressed: _loading ? null : _submit, loading: _loading),
          const SizedBox(height: 8),
          GhostButton(label: 'Cancel', onPressed: () => Navigator.pop(context)),
        ]),
      ),
    );
  }
}

extension _StringExt on String {
  String get capitalize => isEmpty ? this : '${this[0].toUpperCase()}${substring(1)}';
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  const _TabBarDelegate(this.tabBar);
  final TabBar tabBar;
  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlaps) =>
      Container(color: kBg, child: tabBar);
  @override double get maxExtent => 46;
  @override double get minExtent => 46;
  @override bool shouldRebuild(_TabBarDelegate old) => false;
}
