import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';

class SyncScreen extends StatelessWidget {
  const SyncScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(title: const Text('Offline Sync')),
      body: RefreshIndicator(
        color: kGold, backgroundColor: kSurface,
        onRefresh: state.checkConnection,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          // Connection status card
          GoldBanner(height: 110, child: Row(children: [
            Icon(
              state.online ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
              color: state.online ? kGreen : kOrange, size: 36,
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                state.online ? 'Connected' : 'Offline',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                state.online
                    ? 'Backend reachable. Queued actions will sync automatically.'
                    : 'No connection. Actions are saved locally.',
                style: const TextStyle(color: kMuted, fontSize: 12, height: 1.4),
              ),
            ])),
          ])),
          const SizedBox(height: 16),

          // Stats row
          Row(children: [
            Expanded(child: Panel(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${state.pendingActions.length}',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900,
                      color: state.pendingActions.isEmpty ? kMuted : kOrange)),
              const Text('PENDING', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
            ]))),
            const SizedBox(width: 10),
            Expanded(child: Panel(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(state.syncing ? '...' : state.online ? 'ON' : 'OFF',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900,
                      color: state.online ? kGreen : kOrange)),
              const Text('STATUS', style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
            ]))),
          ]),
          const SizedBox(height: 14),

          // Sync button
          SizedBox(
            width: double.infinity, height: 50,
            child: ElevatedButton.icon(
              onPressed: state.syncing ? null : () async {
                try {
                  final summary = await state.syncQueue();
                  if (context.mounted) {
                    final msg = state.online
                        ? 'Synced — ${summary['applied']} applied, ${summary['rejected']} rejected'
                        : 'Cannot reach server. Queue preserved.';
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
                  }
                } catch (e) {
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              },
              icon: state.syncing
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                  : const Icon(Icons.sync_rounded),
              label: Text(state.syncing ? 'Syncing…' : 'Sync Now'),
              style: ElevatedButton.styleFrom(
                backgroundColor: kGold, foregroundColor: Colors.black,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Pending queue
          const SectionTitle('Pending Queue'),
          const SizedBox(height: 10),
          if (state.pendingActions.isEmpty)
            const Panel(child: EmptyState(icon: Icons.task_alt_rounded, title: 'Queue is clear',
                subtitle: 'Offline actions will appear here when you are not connected.'))
          else
            ...state.pendingActions.map((a) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(
                    (a['type'] as String).replaceAll('_', ' ').toUpperCase(),
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 0.7),
                  )),
                  StatusBadge(_statusLabel(a['status'] as String? ?? 'pending'),
                      color: _statusColor(a['status'] as String? ?? 'pending')),
                ]),
                const SizedBox(height: 6),
                Text('ID  ${a['action_id']}', style: const TextStyle(color: kMuted, fontSize: 10, fontFamily: 'monospace')),
                const SizedBox(height: 4),
                Text(_formatTime(a['queued_at'] as String?), style: const TextStyle(color: kMuted, fontSize: 10)),
                if (a['status'] == 'rejected' && a['result'] != null) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: kRed.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(6)),
                    child: Text(_friendlyRejection(a['result'] as Map<String, dynamic>),
                        style: const TextStyle(color: kRed, fontSize: 11)),
                  ),
                ],
              ])),
            )),
        ]),
      ),
    );
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'pending': return 'PENDING';
      case 'rejected': return 'REJECTED';
      case 'applied': return 'SYNCED';
      default: return s.toUpperCase();
    }
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'pending': return kOrange;
      case 'rejected': return kRed;
      case 'applied': return kGreen;
      default: return kMuted;
    }
  }

  String _formatTime(String? ts) {
    if (ts == null) return '';
    try {
      final dt = DateTime.parse(ts).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
      return '${diff.inHours}h ago';
    } catch (_) { return ts; }
  }

  String _friendlyRejection(Map<String, dynamic> result) {
    final code = result['error_code'] as String?;
    switch (code) {
      case 'SQUAD_FULL': return 'Rejected: Destination squad is at maximum capacity';
      case 'NOT_IN_SQUAD': return 'Rejected: Player is no longer in this squad';
      case 'MATCH_NOT_IN_PROGRESS': return 'Rejected: Match is no longer in progress';
      case 'INVALID_COMPENSATION': return 'Rejected: Event has already been overturned';
      case 'TRANSFER_WINDOW_CLOSED': return 'Rejected: Transfer window has closed';
      case 'INVALID_BASE_VERSION': return 'Rejected: Data conflict with server';
      default:
        if (code != null && code.contains('NOT_FOUND')) return 'Rejected: Match, player or squad no longer exists';
        return 'Rejected: ${result['resolution'] ?? code ?? 'Unknown reason'}';
    }
  }
}
