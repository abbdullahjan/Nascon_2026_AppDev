import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';
import 'home_screen.dart';
import 'fixtures_screen.dart';
import 'standings_screen.dart';
import 'store_screen.dart';
import 'club_screen.dart';
import 'sync_screen.dart';
import 'settings_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  final _pages = const [
    HomeScreen(),
    FixturesScreen(),
    StandingsScreen(),
    StoreScreen(),
    ClubScreen(),
  ];

  @override
  void initState() {
    super.initState();
    // Watch connectivity changes
    Connectivity().onConnectivityChanged.listen((_) {
      final state = AppStateScope.of(context);
      state.checkConnection().then((_) {
        if (state.online && state.pendingActions.isNotEmpty) {
          state.syncQueue();
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(children: [
          Container(
            width: 30, height: 30,
            decoration: BoxDecoration(color: kGold, borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.bolt_rounded, color: Colors.black, size: 18),
          ),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('NEXUS',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1.5, color: kText)),
            Text(state.userName.toUpperCase(),
                style: TextStyle(fontSize: 8, color: kMuted, letterSpacing: 1.5, fontWeight: FontWeight.w600)),
          ]),
        ]),
        actions: [
          SyncStatusChip(
            online: state.online,
            syncing: state.syncing,
            pendingCount: state.pendingActions.length,
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncScreen())),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.settings_outlined, size: 20),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.grid_view_rounded), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.sports_rounded), label: 'Fixtures'),
          NavigationDestination(icon: Icon(Icons.leaderboard_rounded), label: 'Standings'),
          NavigationDestination(icon: Icon(Icons.shopping_bag_outlined), label: 'Store'),
          NavigationDestination(icon: Icon(Icons.shield_rounded), label: 'Club'),
        ],
      ),
    );
  }
}
