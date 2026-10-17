import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../widgets/ui.dart';

class FixturesScreen extends StatefulWidget {
  const FixturesScreen({super.key});
  @override
  State<FixturesScreen> createState() => _FixturesScreenState();
}
class _FixturesScreenState extends State<FixturesScreen> {
  String filter = 'All';
  final fixtures = const [
    _Fixture('Northside FC', 'Riverside United', '18:30', 'Upcoming', 'Football', 'A-01'),
    _Fixture('Falcons', 'Titans', '19:00', 'In-Progress', 'Basketball', 'Court 2'),
    _Fixture('Abbottabad XI', 'Capital CC', '19:30', 'Upcoming', 'Cricket', 'Ground A'),
    _Fixture('Nova Five', 'Pixel Wolves', '20:00', 'Completed', 'Esports', 'Arena'),
  ];
  @override
  Widget build(BuildContext context) {
    final visible = fixtures.where((f) => filter == 'All' || f.status == filter).toList();
    return ListView(padding: const EdgeInsets.fromLTRB(18, 4, 18, 24), children: [
      const Eyebrow('League Alpha · Season 2026'),
      const SizedBox(height: 8),
      const Text('Fixtures', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: -1)),
      const SizedBox(height: 6),
      const Text('Your matchday, at a glance.', style: TextStyle(color: muted)),
      const SizedBox(height: 18),
      Wrap(spacing: 8, children: ['All','Upcoming','In-Progress','Completed'].map((s) => ChoiceChip(
        label: Text(s), selected: filter == s, onSelected: (_) => setState(() => filter = s),
        selectedColor: lime, labelStyle: TextStyle(color: filter == s ? const Color(0xFF10160E) : Colors.white, fontWeight: FontWeight.w700),
      )).toList()),
      const SizedBox(height: 14),
      ...visible.map((f) => Padding(padding: const EdgeInsets.only(bottom: 10), child: _FixtureCard(fixture: f))),
      if (visible.isEmpty) const EmptyState(title: 'No matches in this view', subtitle: 'Try another status filter.', icon: Icons.event_busy_rounded),
    ]);
  }
}

class _Fixture {
  const _Fixture(this.home, this.away, this.time, this.status, this.sport, this.venue);
  final String home, away, time, status, sport, venue;
}
class _FixtureCard extends StatelessWidget {
  const _FixtureCard({required this.fixture});
  final _Fixture fixture;
  Color get statusColor => fixture.status == 'In-Progress' ? lime : fixture.status == 'Completed' ? Colors.blueAccent : Colors.orangeAccent;
  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(20),
    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _MatchDetailScreen(fixture: fixture))),
    child: Panel(child: Column(children: [
      Row(children: [Text(fixture.sport.toUpperCase(), style: const TextStyle(color: muted, fontSize: 10, letterSpacing: 1.3, fontWeight: FontWeight.w900)), const Spacer(), StatusPill(label: fixture.status.toUpperCase(), color: statusColor)]),
      const SizedBox(height: 17),
      Row(children: [
        Expanded(child: Column(children: [CircleAvatar(radius: 23, backgroundColor: const Color(0xFF253A23), child: Text(fixture.home.substring(0,1), style: const TextStyle(color: lime, fontWeight: FontWeight.w900))), const SizedBox(height: 8), Text(fixture.home, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12))])),
        const Column(children: [Text('VS', style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2)), SizedBox(height: 6), Text('— : —', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900))]),
        Expanded(child: Column(children: [CircleAvatar(radius: 23, backgroundColor: const Color(0xFF222A32), child: Text(fixture.away.substring(0,1), style: const TextStyle(color: Colors.lightBlueAccent, fontWeight: FontWeight.w900))), const SizedBox(height: 8), Text(fixture.away, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12))])),
      ]),
      const SizedBox(height: 16), const Divider(color: line, height: 1), const SizedBox(height: 12),
      Row(children: [const Icon(Icons.schedule_rounded, size: 14, color: muted), const SizedBox(width: 5), Text(fixture.time, style: const TextStyle(color: muted, fontSize: 11)), const SizedBox(width: 14), const Icon(Icons.location_on_outlined, size: 14, color: muted), const SizedBox(width: 4), Text(fixture.venue, style: const TextStyle(color: muted, fontSize: 11)), const Spacer(), const Icon(Icons.arrow_forward_rounded, size: 17, color: lime)]),
    ])),
  );
}

class _MatchDetailScreen extends StatelessWidget {
  const _MatchDetailScreen({required this.fixture});
  final _Fixture fixture;
  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Match centre')),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        const Eyebrow('League Alpha · Matchday'),
        const SizedBox(height: 10),
        Panel(child: Column(children: [
          const StatusPill(label: 'LIVE MATCH CENTRE', color: Colors.orangeAccent),
          const SizedBox(height: 20),
          Text(fixture.sport.toUpperCase(), style: const TextStyle(color: muted, letterSpacing: 2, fontSize: 10, fontWeight: FontWeight.w900)),
          const SizedBox(height: 18),
          Row(children: [
            Expanded(child: Column(children: [const CircleAvatar(radius: 28, child: Icon(Icons.shield_rounded)), const SizedBox(height: 8), Text(fixture.home, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800))])),
            const Text('0  —  0', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
            Expanded(child: Column(children: [const CircleAvatar(radius: 28, child: Icon(Icons.shield_outlined)), const SizedBox(height: 8), Text(fixture.away, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800))])),
          ]),
          const SizedBox(height: 18),
          const Text('Timeline is ready to connect to the live event stream.', textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 12)),
        ])),
        const SizedBox(height: 16),
        const SectionTitle('Match timeline'),
        const SizedBox(height: 8),
        const Panel(child: EmptyState(title: 'No events yet', subtitle: 'Score events and corrections will appear here in sequence.', icon: Icons.timeline_rounded)),
        const SizedBox(height: 16),
        const SectionTitle('Pinned merchandise'),
        const SizedBox(height: 8),
        const Panel(child: ListTile(leading: Icon(Icons.shopping_bag_outlined, color: lime), title: Text('Alpha matchday jersey'), subtitle: Text('PKR 4,500 · Medium / Large'), trailing: Icon(Icons.push_pin_outlined, color: lime))),
        const SizedBox(height: 16),
        PrimaryButton(label: 'Queue score action (offline-ready)', icon: Icons.add_rounded, onPressed: () async {
          await state.queueAction('score', {'match_id':'m1','team_id':'t1','event_type':'goal'});
          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Action queued. It will sync when online.')));
        }),
      ]),
    );
  }
}
