import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';
import 'sync_screen.dart';
import 'fixtures_screen.dart';
import 'standings_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return RefreshIndicator(
      color: kGold,
      backgroundColor: kSurface,
      onRefresh: state.checkConnection,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          const SizedBox(height: 8),
          // Hero championship banner
          GoldBanner(
            height: 140,
            child: Stack(children: [
              Positioned(right: -10, top: -10,
                  child: Icon(Icons.emoji_events_rounded, size: 120,
                      color: kGold.withValues(alpha: 0.07))),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Eyebrow('NaSCon \'26 · Season Active'),
                const Spacer(),
                Text('CHAMPIONSHIP', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: kText, letterSpacing: -0.5)),
                const SizedBox(height: 2),
                Text(state.userName, style: const TextStyle(color: kGold, fontWeight: FontWeight.w700, fontSize: 13)),
                const SizedBox(height: 8),
                StatusBadge(_roleLabel(state.role)),
              ]),
            ]),
          ),
          const SizedBox(height: 20),
          // Quick stats row
          const SectionTitle('Overview'),
          const SizedBox(height: 10),
          Row(children: const [
            Expanded(child: _StatCard('4', 'Sports', Icons.sports_soccer_rounded)),
            SizedBox(width: 10),
            Expanded(child: _StatCard('2', 'Tenants', Icons.apartment_rounded)),
            SizedBox(width: 10),
            Expanded(child: _StatCard('3', 'Leagues', Icons.emoji_events_outlined)),
          ]),
          const SizedBox(height: 20),
          // Quick actions based on role
          const SectionTitle('Quick actions'),
          const SizedBox(height: 10),
          _QuickAction(
            icon: Icons.sports_rounded,
            title: 'Fixtures',
            subtitle: 'Upcoming and live matches',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FixturesScreen())),
          ),
          const SizedBox(height: 8),
          _QuickAction(
            icon: Icons.leaderboard_rounded,
            title: 'Standings',
            subtitle: 'League tables with qualification',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const StandingsScreen())),
          ),
          const SizedBox(height: 8),
          _QuickAction(
            icon: Icons.cloud_sync_outlined,
            title: 'Sync queue',
            subtitle: '${state.pendingActions.length} action${state.pendingActions.length == 1 ? '' : 's'} pending',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncScreen())),
          ),
          if (state.isOrganizer || state.isManager) ...[
            const SizedBox(height: 8),
            _QuickAction(
              icon: Icons.edit_note_rounded,
              title: state.isOrganizer ? 'Record score event' : 'Manage roster',
              subtitle: state.isOrganizer ? 'Organizer · append to match log' : 'Manager · transfer or loan a player',
              onTap: () {},
              badgeLabel: 'RESTRICTED',
            ),
          ],
          const SizedBox(height: 20),
          // Offline status card
          Panel(child: Row(children: [
            Icon(
              state.online ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
              color: state.online ? kGreen : kOrange, size: 28,
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(state.online ? 'Backend connected' : 'Backend offline',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 2),
              Text(
                state.online
                    ? 'All features available. Queue syncs automatically.'
                    : 'Cached data shown. Actions queued for sync.',
                style: TextStyle(color: kMuted, fontSize: 11, height: 1.4),
              ),
            ])),
          ])),
        ],
      ),
    );
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'super_admin': return 'SUPER ADMIN';
      case 'league_organizer': return 'ORGANIZER';
      case 'club_manager': return 'CLUB MGR';
      case 'player': return 'PLAYER';
      default: return 'VIEWER';
    }
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard(this.value, this.label, this.icon);
  final String value, label;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Panel(
    padding: const EdgeInsets.all(14),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, color: kGold, size: 18),
      const SizedBox(height: 10),
      Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: kText)),
      const SizedBox(height: 2),
      Text(label, style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
    ]),
  );
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.title, required this.subtitle, required this.onTap, this.badgeLabel});
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  final String? badgeLabel;
  @override
  Widget build(BuildContext context) => Panel(
    padding: EdgeInsets.zero,
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      leading: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color: kGold.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: kGold, size: 20),
      ),
      title: Row(children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        if (badgeLabel != null) ...[
          const SizedBox(width: 8),
          StatusBadge(badgeLabel!, color: kMuted),
        ],
      ]),
      subtitle: Text(subtitle, style: TextStyle(color: kMuted, fontSize: 11)),
      trailing: Icon(Icons.chevron_right_rounded, color: kMuted, size: 20),
      onTap: onTap,
    ),
  );
}
