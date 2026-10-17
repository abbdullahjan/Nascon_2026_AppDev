import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../widgets/ui.dart';

class ClubScreen extends StatelessWidget {
  const ClubScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return ListView(padding: const EdgeInsets.fromLTRB(18, 4, 18, 24), children: [
      const Eyebrow('Club portal · tenant isolated'),
      const SizedBox(height: 8),
      const Text('Club profile', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: -1)),
      const SizedBox(height: 16),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 60, height: 60, decoration: BoxDecoration(color: lime.withValues(alpha: .14), borderRadius: BorderRadius.circular(18)), child: const Icon(Icons.shield_rounded, color: lime, size: 34)),
          const SizedBox(width: 14),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Northside FC', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
            SizedBox(height: 4), Text('ALPHA SPORTS · EST. 2014', style: TextStyle(color: muted, fontSize: 9, letterSpacing: 1.2, fontWeight: FontWeight.w800)),
          ])),
          const StatusPill(label: 'ACTIVE'),
        ]),
        const SizedBox(height: 20),
        const Row(children: [
          Expanded(child: _Stat('12','PLAYERS')), Expanded(child: _Stat('08','WINS')), Expanded(child: _Stat('02','TROPHIES')),
        ]),
        const SizedBox(height: 18),
        const Row(children: [Icon(Icons.location_on_outlined, color: lime, size: 18), SizedBox(width: 7), Expanded(child: Text('Northside Sports Complex · Islamabad', style: TextStyle(color: muted, fontSize: 12)))]),
      ])),
      const SizedBox(height: 18),
      const SectionTitle('Roster', action: StatusPill(label: '12 REGISTERED')),
      const SizedBox(height: 10),
      ...const [
        ('AH','Ali Hassan','Goalkeeper','Captain'),
        ('BK','Bilal Khan','Defender','Starter'),
        ('OM','Omar Malik','Midfielder','Starter'),
        ('SA','Saad Ahmed','Forward','Vice-captain'),
      ].map((p) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Panel(padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10), child: Row(children: [
        CircleAvatar(backgroundColor: const Color(0xFF243524), child: Text(p.$1, style: const TextStyle(color: lime, fontSize: 11, fontWeight: FontWeight.w900))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(p.$2, style: const TextStyle(fontWeight: FontWeight.w800)), const SizedBox(height: 3), Text(p.$3, style: const TextStyle(color: muted, fontSize: 11))])),
        Text(p.$4.toUpperCase(), style: const TextStyle(color: lime, fontSize: 9, letterSpacing: .7, fontWeight: FontWeight.w900)),
      ])))),
      const SizedBox(height: 12),
      if (state.role == 'Club Manager' || state.role == 'Platform Super-Admin')
        PrimaryButton(label: 'Add / transfer / loan player', icon: Icons.person_add_alt_1_rounded, onPressed: () => _rosterAction(context, state))
      else
        const Panel(child: Text('Roster controls appear for the Club Manager role. Sign in with manager@nascon.test to access the management workflow.', style: TextStyle(color: muted, height: 1.5, fontSize: 12))),
      const SizedBox(height: 16),
      const Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Eyebrow('Club staff'),
        SizedBox(height: 10),
        ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.person_outline, color: lime), title: Text('Hassan Raza'), subtitle: Text('Head Coach')),
        ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.medical_services_outlined, color: lime), title: Text('Dr. Sara Ali'), subtitle: Text('Team Physio')),
      ])),
    ]);
  }

  Future<void> _rosterAction(BuildContext context, AppState state) async {
    final id = TextEditingController(text: 'player-alpha-1');
    final from = TextEditingController(text: 'sq-a');
    final to = TextEditingController(text: 'sq-b');
    final result = await showDialog<List<String>>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Transfer player'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller:id, decoration:const InputDecoration(labelText:'Player ID')),
        const SizedBox(height:8), TextField(controller:from, decoration:const InputDecoration(labelText:'From squad ID')),
        const SizedBox(height:8), TextField(controller:to, decoration:const InputDecoration(labelText:'To squad ID')),
      ]),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,[id.text,from.text,to.text]),child:const Text('Save action'))],
    ));
    if (result == null) return;
    await state.queueAction('roster_transfer', {'player_id':result[0],'from_squad_id':result[1],'to_squad_id':result[2],'type':'transfer','league_id':'league-alpha-1'});
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer queued. Sync to validate server-side rules.')));
  }
}
class _Stat extends StatelessWidget {
  const _Stat(this.value,this.label);
  final String value,label;
  @override
  Widget build(BuildContext context)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text(value,style:const TextStyle(fontSize:24,fontWeight:FontWeight.w900,color:lime)),
    const SizedBox(height:3),Text(label,style:const TextStyle(color:muted,fontSize:9,letterSpacing:1,fontWeight:FontWeight.w800)),
  ]);
}
