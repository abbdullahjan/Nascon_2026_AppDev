import 'package:flutter/material.dart';
import '../core/app_state.dart';
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
  int index = 0;
  final pages = const [
    HomeScreen(), FixturesScreen(), StandingsScreen(), StoreScreen(), ClubScreen()
  ];
  final titles = const ['Overview', 'Fixtures', 'Standings', 'Club Store', 'Club Profile'];

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(children: [
          Container(width: 34, height: 34, decoration: BoxDecoration(color: lime, borderRadius: BorderRadius.circular(11)),
            child: const Icon(Icons.bolt_rounded, color: Color(0xFF10160E), size: 23)),
          const SizedBox(width: 10),
          const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('NEXUS', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
            Text('LEAGUE OPERATIONS', style: TextStyle(fontSize: 8, color: muted, letterSpacing: 1.5)),
          ]),
        ]),
        actions: [
          IconButton(tooltip: 'Sync status', onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncScreen())), icon: Badge(label: Text('${state.pendingActions.length}'), isLabelVisible: state.pendingActions.isNotEmpty, child: const Icon(Icons.sync_rounded))),
          IconButton(tooltip: 'Settings', onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())), icon: const Icon(Icons.tune_rounded)),
          const SizedBox(width: 6),
        ],
      ),
      body: Column(children: [
        Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(color: panel, borderRadius: BorderRadius.circular(14), border: Border.all(color: line)),
          child: Row(children: [
            Icon(state.online ? Icons.wifi_rounded : Icons.wifi_off_rounded, size: 16, color: state.online ? lime : Colors.orangeAccent),
            const SizedBox(width: 8),
            Text(state.online ? 'ONLINE' : 'OFFLINE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: state.online ? lime : Colors.orangeAccent, letterSpacing: 1)),
            const SizedBox(width: 8),
            const Text('•', style: TextStyle(color: muted)),
            const SizedBox(width: 8),
            Expanded(child: Text(state.userName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: muted))),
            Text(state.role, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
          ]),
        ),
        Expanded(child: IndexedStack(index: index, children: pages)),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        backgroundColor: const Color(0xFF0F1411),
        indicatorColor: lime.withValues(alpha: .16),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.grid_view_rounded), label: 'Overview'),
          NavigationDestination(icon: Icon(Icons.sports_soccer_rounded), label: 'Fixtures'),
          NavigationDestination(icon: Icon(Icons.leaderboard_rounded), label: 'Table'),
          NavigationDestination(icon: Icon(Icons.shopping_bag_outlined), label: 'Store'),
          NavigationDestination(icon: Icon(Icons.shield_outlined), label: 'Club'),
        ],
      ),
    );
  }
}
