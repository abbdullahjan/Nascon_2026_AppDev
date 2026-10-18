import 'package:flutter/material.dart';
import '../models/sync_action.dart';
import '../services/api_service.dart';
import '../services/offline_queue_service.dart';
import '../theme.dart';

/// Screen 8: Offline Pending Action Queue & Manual Sync Screen (Section 8.4)
/// Displays queued score events and roster actions with real-time sync results.
class PendingQueueScreen extends StatefulWidget {
  const PendingQueueScreen({super.key});

  @override
  State<PendingQueueScreen> createState() => _PendingQueueScreenState();
}

class _PendingQueueScreenState extends State<PendingQueueScreen> {
  final ApiService _apiService = ApiService();
  final OfflineQueueService _queueService = OfflineQueueService();

  bool _isLoading = true;
  bool _isSyncing = false;
  List<OfflineAction> _queuedActions = [];
  SyncResponse? _lastSyncResponse;
  String? _syncErrorMessage;

  @override
  void initState() {
    super.initState();
    _loadQueue();
  }

  Future<void> _loadQueue() async {
    setState(() => _isLoading = true);
    final actions = await _queueService.getQueue();
    if (!mounted) return;
    setState(() {
      _queuedActions = actions;
      _isLoading = false;
    });
  }

  Future<void> _triggerSync() async {
    if (_queuedActions.isEmpty) return;

    setState(() {
      _isSyncing = true;
      _syncErrorMessage = null;
    });

    try {
      final response = await _apiService.syncOfflineQueue();
      if (!mounted) return;
      setState(() {
        _lastSyncResponse = response;
        _isSyncing = false;
      });
      _loadQueue();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _syncErrorMessage = 'Sync failed: $e';
        _isSyncing = false;
      });
    }
  }

  Future<void> _clearQueue() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Clear Queue'),
        content: const Text('Discard all locally queued offline actions?'),
        actions: [
          OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _queueService.clearQueue();
      _loadQueue();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Offline Action Queue', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        actions: [
          if (_queuedActions.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_outline_rounded, color: AppColors.error),
              tooltip: 'Clear Queue',
              onPressed: _clearQueue,
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildSyncStatusCard(),
                const SizedBox(height: 16),
                if (_syncErrorMessage != null) ...[
                  _buildErrorCard(),
                  const SizedBox(height: 16),
                ],
                if (_lastSyncResponse != null) ...[
                  _buildSyncResultCard(_lastSyncResponse!),
                  const SizedBox(height: 16),
                ],
                _buildQueueSection(),
              ],
            ),
    );
  }

  Widget _buildSyncStatusCard() {
    final count = _queuedActions.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: count > 0 ? AppColors.warning : AppColors.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: (count > 0 ? AppColors.warning : AppColors.primary).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  count > 0 ? Icons.sync_problem_rounded : Icons.cloud_done_rounded,
                  color: count > 0 ? AppColors.warning : AppColors.primary,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      count > 0 ? '$count Action${count > 1 ? "s" : ""} Pending' : 'All Actions Synchronized',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                    ),
                    Text(
                      count > 0
                          ? 'Queued while offline (Section 8.4 Desk Check).'
                          : 'Local queue is clear and up to date.',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (count > 0) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.textInverse,
                ),
                icon: _isSyncing
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.textInverse))
                    : const Icon(Icons.sync_rounded, size: 18),
                label: Text(_isSyncing ? 'Replaying Actions...' : 'Sync Now ($count)'),
                onPressed: _isSyncing ? null : _triggerSync,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildErrorCard() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.error),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.error, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(_syncErrorMessage!, style: const TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }

  Widget _buildSyncResultCard(SyncResponse resp) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.primary),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.check_circle_rounded, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text('Latest Sync Summary', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.primary)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildMetric('Applied', '${resp.summary.applied}', AppColors.primary),
              _buildMetric('Rejected', '${resp.summary.rejected}', AppColors.error),
              _buildMetric('Duplicate', '${resp.summary.duplicate}', AppColors.textSecondary),
            ],
          ),
          if (resp.results.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Divider(color: AppColors.borderSubtle),
            const SizedBox(height: 8),
            ...resp.results.map((r) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Icon(r.isSuccess ? Icons.check : Icons.close, size: 14, color: r.isSuccess ? AppColors.primary : AppColors.error),
                      const SizedBox(width: 6),
                      Text(r.actionId, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                      const SizedBox(width: 8),
                      Text('(${r.resolution})', style: const TextStyle(color: AppColors.textTertiary, fontSize: 11)),
                      if (r.errorCode != null) ...[
                        const Spacer(),
                        Text(r.errorCode!, style: const TextStyle(color: AppColors.error, fontSize: 11, fontWeight: FontWeight.w700)),
                      ],
                    ],
                  ),
                )),
          ],
        ],
      ),
    );
  }

  Widget _buildMetric(String label, String value, Color color) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: color)),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
      ],
    );
  }

  Widget _buildQueueSection() {
    if (_queuedActions.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: const Center(
          child: Column(
            children: [
              Icon(Icons.inbox_rounded, size: 48, color: AppColors.border),
              SizedBox(height: 12),
              Text('Queue is Empty', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              SizedBox(height: 4),
              Text(
                'Actions performed in airplane mode will be held here until reconnected.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('QUEUED ACTIONS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
        const SizedBox(height: 10),
        ..._queuedActions.map((a) => _buildActionCard(a)),
      ],
    );
  }

  Widget _buildActionCard(OfflineAction action) {
    final isScore = action.type == 'score_event';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: (isScore ? AppColors.primary : AppColors.secondary).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                isScore ? Icons.sports_soccer_rounded : Icons.swap_horiz_rounded,
                color: isScore ? AppColors.primary : AppColors.secondary,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(action.type.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.textPrimary)),
                      const SizedBox(width: 8),
                      Text('v${action.baseVersion}', style: const TextStyle(fontSize: 10, color: AppColors.textTertiary)),
                    ],
                  ),
                  Text('ID: ${action.actionId}', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text('PENDING', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.warning)),
            ),
          ],
        ),
      ),
    );
  }
}
