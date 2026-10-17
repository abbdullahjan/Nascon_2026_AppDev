import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../widgets/ui.dart';

class SyncScreen extends StatelessWidget {
  const SyncScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Offline & sync centre')),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Icon(state.online ? Icons.cloud_done_rounded : Icons.cloud_off_rounded, color: state.online ? lime : Colors.orangeAccent, size: 30), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(state.online ? 'You are connected' : 'You are offline', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
            const SizedBox(height: 4), Text(state.online ? 'Cached screens remain available.' : 'New actions are saved locally until you reconnect.', style: const TextStyle(color: muted, fontSize: 12)),
          ]))]),
          const SizedBox(height: 16),
          Row(children: [Expanded(child: _Counter(label:'PENDING',value:'${state.pendingActions.length}')), const SizedBox(width:10), Expanded(child: _Counter(label:'RESULTS',value:'${state.activity.length}'))]),
          const SizedBox(height: 16),
          PrimaryButton(label: state.syncing ? 'Syncing…' : 'Sync now', icon: Icons.sync_rounded, onPressed: state.syncing ? null : () async {
            await state.syncQueue();
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.online ? 'Sync request completed.' : 'Cannot reach server. Queue preserved.')));
          }),
        ])),
        const SizedBox(height: 20),
        const SectionTitle('Pending actions'),
        const SizedBox(height: 8),
        if (state.pendingActions.isEmpty)
          const Panel(child: EmptyState(title:'Queue is clear',subtitle:'Actions you create offline will appear here.',icon:Icons.task_alt_rounded))
        else
          ...state.pendingActions.map((a) => Padding(padding: const EdgeInsets.only(bottom:8), child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Expanded(child: Text(a['type'].toString().replaceAll('_',' ').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11, letterSpacing: .7))), const StatusPill(label:'PENDING',color:Colors.orangeAccent)]),
            const SizedBox(height: 8), Text('ID  ${a['action_id']}', style: const TextStyle(color: muted, fontSize: 10)),
            const SizedBox(height: 6), Text('${a['payload']}', style: const TextStyle(fontSize: 11)),
            const SizedBox(height: 6), Text('${a['created_at']}', style: const TextStyle(color: muted, fontSize: 10)),
          ])))),
        const SizedBox(height: 16),
        const SectionTitle('Recent sync results'),
        const SizedBox(height: 8),
        if (state.activity.isEmpty) const Panel(child: EmptyState(title:'No sync results yet',subtitle:'Applied or rejected action outcomes will be listed here.',icon:Icons.history_rounded))
        else ...state.activity.map((a) => ListTile(title:Text('${a['action_id'] ?? 'Action'}'),subtitle:Text('${a['status'] ?? 'Result'} · ${a['reason'] ?? ''}'))),
      ]),
    );
  }
}
class _Counter extends StatelessWidget {
  const _Counter({required this.label,required this.value});
  final String label,value;
  @override
  Widget build(BuildContext context)=>Container(padding:const EdgeInsets.all(14),decoration:BoxDecoration(color:const Color(0xFF1B241C),borderRadius:BorderRadius.circular(14)),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text(value,style:const TextStyle(fontSize:25,fontWeight:FontWeight.w900,color:lime)),const SizedBox(height:3),Text(label,style:const TextStyle(color:muted,fontSize:9,letterSpacing:1,fontWeight:FontWeight.w800))
  ]));
}
