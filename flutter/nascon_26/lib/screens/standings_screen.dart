import 'package:flutter/material.dart';
import '../widgets/ui.dart';

class StandingsScreen extends StatelessWidget {
  const StandingsScreen({super.key});
  static const rows = [
    ['1','Northside FC','6','5','1','16','+9','CLINCHED'],
    ['2','Riverside United','6','4','1','13','+5','POSSIBLE'],
    ['3','Capital Athletic','6','3','0','9','+2','POSSIBLE'],
    ['4','Valley Rangers','6','2','1','7','−1','POSSIBLE'],
    ['5','Eastside City','6','1','1','4','−6','ELIMINATED'],
  ];
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.fromLTRB(18, 4, 18, 24), children: [
    const Eyebrow('League Alpha · Football'),
    const SizedBox(height: 8),
    const Text('Standings', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: -1)),
    const SizedBox(height: 6),
    const Text('A table that tells the whole story.', style: TextStyle(color: muted)),
    const SizedBox(height: 18),
    const Row(children: [
      Expanded(child: _Summary(label:'MATCHES PLAYED', value:'30')),
      SizedBox(width:10),
      Expanded(child: _Summary(label:'PLAYOFF SPOTS', value:'02')),
    ]),
    const SizedBox(height: 18),
    const SectionTitle('League table', action: StatusPill(label: 'UPDATED JUST NOW')),
    const SizedBox(height: 10),
    Panel(padding: const EdgeInsets.all(10), child: Column(children: [
      const Row(children: [
        SizedBox(width: 25, child: Text('#', style: TextStyle(color: muted, fontSize: 10))),
        Expanded(child: Text('CLUB', style: TextStyle(color: muted, fontSize: 10, letterSpacing: 1))),
        SizedBox(width: 29, child: Text('P', textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 10))),
        SizedBox(width: 29, child: Text('GD', textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 10))),
        SizedBox(width: 35, child: Text('PTS', textAlign: TextAlign.right, style: TextStyle(color: muted, fontSize: 10))),
      ]),
      const Divider(color: line, height: 20),
      ...rows.map((r) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(children: [
          SizedBox(width: 25, child: Text(r[0], style: TextStyle(color: r[0]=='1' ? lime : muted, fontWeight: FontWeight.w900))),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r[1], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            const SizedBox(height: 4),
            Text(r[7], style: TextStyle(fontSize: 8, letterSpacing: .8, fontWeight: FontWeight.w900, color: r[7]=='CLINCHED' ? lime : r[7]=='ELIMINATED' ? Colors.redAccent : muted)),
          ])),
          SizedBox(width: 29, child: Text(r[2], textAlign: TextAlign.center, style: const TextStyle(color: muted, fontSize: 12))),
          SizedBox(width: 29, child: Text(r[6], textAlign: TextAlign.center, style: const TextStyle(color: muted, fontSize: 12))),
          SizedBox(width: 35, child: Text(r[5], textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13))),
        ]),
      )),
    ])),
    const SizedBox(height: 14),
    const Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Eyebrow('Standings intelligence'),
      SizedBox(height: 8),
      Text('Qualification outlook', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
      SizedBox(height: 8),
      Text('Qualification status is determined from points and remaining fixtures. Tie-break detail includes head-to-head mini-league, overall differential, scored totals, fair play and seeded lots.', style: TextStyle(color: muted, height: 1.5, fontSize: 12)),
    ])),
  ]);
}
class _Summary extends StatelessWidget {
  const _Summary({required this.label, required this.value});
  final String label, value;
  @override
  Widget build(BuildContext context) => Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(value, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: lime)),
    const SizedBox(height: 4), Text(label, style: const TextStyle(fontSize: 9, letterSpacing: 1, color: muted, fontWeight: FontWeight.w800)),
  ]));
}
