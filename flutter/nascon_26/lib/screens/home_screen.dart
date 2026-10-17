import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../widgets/ui.dart';
import 'sync_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return RefreshIndicator(
      onRefresh: state.checkConnection,
      child: ListView(padding: const EdgeInsets.fromLTRB(18, 4, 18, 28), children: [
        const Eyebrow('Saturday • Matchday control centre'),
        const SizedBox(height: 10),
        const Text('Every game.\nOne command centre.', style: TextStyle(fontSize: 32, height: 1.05, fontWeight: FontWeight.w900, letterSpacing: -1.3)),
        const SizedBox(height: 12),
        const Text('Your leagues, live scores, club operations and matchday commerce — connected.', style: TextStyle(color: muted, height: 1.5)),
        const SizedBox(height: 22),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFF253A23), Color(0xFF141D16)], begin: Alignment.topLeft, end: Alignment.bottomRight),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: lime.withValues(alpha: .25)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: const [StatusPill(label: 'MATCHDAY LIVE'), Spacer(), Icon(Icons.bolt_rounded, color: lime, size: 26)]),
            const SizedBox(height: 22),
            const Text('LEAGUE ALPHA', style: TextStyle(color: lime, letterSpacing: 1.7, fontWeight: FontWeight.w900, fontSize: 11)),
            const SizedBox(height: 8),
            const Text('Northside FC', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const Text('VS', style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2)),
            const Text('Riverside United', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 18),
            const Row(children: [
              Icon(Icons.schedule_rounded, size: 16, color: muted),
              SizedBox(width: 7),
              Text('Today · 18:30', style: TextStyle(color: muted, fontSize: 12)),
              Spacer(),
              StatusPill(label: 'UPCOMING'),
            ]),
          ]),
        ),
        const SizedBox(height: 20),
        const SectionTitle('At a glance'),
        const SizedBox(height: 12),
        Row(children: const [
          Expanded(child: _Metric(value: '08', label: 'FIXTURES', icon: Icons.calendar_month_rounded)),
          SizedBox(width: 10),
          Expanded(child: _Metric(value: '04', label: 'LEAGUES', icon: Icons.emoji_events_outlined)),
          SizedBox(width: 10),
          Expanded(child: _Metric(value: '12', label: 'CLUBS', icon: Icons.groups_2_outlined)),
        ]),
        const SizedBox(height: 22),
        const SectionTitle('Quick actions'),
        const SizedBox(height: 12),
        _QuickAction(icon: Icons.edit_note_rounded, title: 'Record a score', subtitle: 'Organizer · append score event', onTap: () => _scoreDialog(context, state)),
        const SizedBox(height: 9),
        _QuickAction(icon: Icons.swap_horiz_rounded, title: 'Manage a roster', subtitle: 'Manager · transfer or loan', onTap: () => _rosterDialog(context, state)),
        const SizedBox(height: 9),
        _QuickAction(icon: Icons.cloud_sync_outlined, title: 'Offline action queue', subtitle: '${state.pendingActions.length} actions waiting to sync', onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncScreen()))),
        const SizedBox(height: 20),
        const Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Eyebrow('Built for the edge of the game'),
          SizedBox(height: 8),
          Text('MatchPulse', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          SizedBox(height: 6),
          Text('A clear live timeline, an audit trail for every correction, and offline actions that survive app restarts.', style: TextStyle(color: muted, height: 1.5)),
        ])),
      ]),
    );
  }

  Future<void> _scoreDialog(BuildContext context, AppState state) async {
    final match = TextEditingController(text: 'm1');
    final team = TextEditingController(text: 't1');
    final event = TextEditingController(text: 'goal');
    final result = await showDialog<Map<String, String>>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Record score event'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: match, decoration: const InputDecoration(labelText: 'Match ID')),
        const SizedBox(height: 8), TextField(controller: team, decoration: const InputDecoration(labelText: 'Team ID')),
        const SizedBox(height: 8), TextField(controller: event, decoration: const InputDecoration(labelText: 'Event type')),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, {'match_id':match.text,'team_id':team.text,'event_type':event.text}), child: const Text('Queue event'))],
    ));
    if (result == null) return;
    await state.queueAction('score', {'match_id':result['match_id'],'team_id':result['team_id'],'event_type':result['event_type']});
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Score action saved to the persistent sync queue.')));
  }

  Future<void> _rosterDialog(BuildContext context, AppState state) async {
    final player = TextEditingController(text: 'player-alpha-1');
    final from = TextEditingController(text: 'sq-a');
    final to = TextEditingController(text: 'sq-b');
    final result = await showDialog<Map<String, String>>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Queue roster action'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: player, decoration: const InputDecoration(labelText: 'Player ID')),
        const SizedBox(height: 8), TextField(controller: from, decoration: const InputDecoration(labelText: 'From squad')),
        const SizedBox(height: 8), TextField(controller: to, decoration: const InputDecoration(labelText: 'To squad')),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, {'player_id':player.text,'from_squad_id':from.text,'to_squad_id':to.text}), child: const Text('Queue transfer'))],
    ));
    if (result == null) return;
    await state.queueAction('roster_transfer', result);
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Roster action saved to the persistent sync queue.')));
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.value, required this.label, required this.icon});
  final String value, label; final IconData icon;
  @override
  Widget build(BuildContext context) => Panel(padding: const EdgeInsets.all(13), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Icon(icon, color: lime, size: 19), const SizedBox(height: 14),
    Text(value, style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
    const SizedBox(height: 3), Text(label, style: const TextStyle(fontSize: 9, color: muted, fontWeight: FontWeight.w800, letterSpacing: 1)),
  ]));
}
class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon; final String title, subtitle; final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Panel(padding: EdgeInsets.zero, child: ListTile(
    minVerticalPadding: 8,
    leading: Container(width: 42, height: 42, decoration: BoxDecoration(color: lime.withValues(alpha: .12), borderRadius: BorderRadius.circular(13)), child: Icon(icon, color: lime)),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
    subtitle: Text(subtitle, style: const TextStyle(color: muted, fontSize: 11)),
    trailing: const Icon(Icons.chevron_right_rounded, color: muted),
    onTap: onTap,
  ));
}
