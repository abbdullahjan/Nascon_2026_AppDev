import 'package:flutter/material.dart';
import '../models/club.dart';
import '../services/api_service.dart';
import '../theme.dart';
import '../widgets/sync_bar.dart';

/// Screen 6: Roster Management Screen (For Club Manager)
/// Allows club managers to transfer, loan, and release players with audit trails (Section 5.11 & 8.4).
class RosterManagementScreen extends StatefulWidget {
  const RosterManagementScreen({super.key});

  @override
  State<RosterManagementScreen> createState() => _RosterManagementScreenState();
}

class _RosterManagementScreenState extends State<RosterManagementScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  String? _statusBanner;
  bool _isSuccessBanner = true;
  ClubModel? _club;

  final String _managerClubId = 'club-alpha-1';

  @override
  void initState() {
    super.initState();
    _loadClubRoster();
  }

  Future<void> _loadClubRoster() async {
    setState(() {
      _isLoading = true;
      _statusBanner = null;
    });

    try {
      final club = await _apiService.getClubDetail(_managerClubId);
      if (!mounted) return;
      setState(() {
        _club = club;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _performRosterAction({
    required String actionType, // 'transfer' | 'loan' | 'release'
    required PlayerRegistration player,
    String? targetClubId,
    String? loanEndDate,
  }) async {
    final body = {
      'action': actionType,
      'player_id': player.playerId,
      'source_club_id': _managerClubId,
      'target_club_id': targetClubId ?? 'club-alpha-2',
      if (actionType == 'loan') 'loan_end_date': loanEndDate ?? '2026-12-31T23:59:59Z',
    };

    final result = await _apiService.rosterTransfer(body);

    if (!mounted) return;

    setState(() {
      if (result['queued_offline'] == true) {
        _statusBanner = 'Offline: Roster $actionType queued for sync.';
        _isSuccessBanner = true;
      } else if (result['success'] == true) {
        _statusBanner = 'Player ${player.name} $actionType completed!';
        _isSuccessBanner = true;
      } else {
        _statusBanner = result['error']?.toString() ?? 'Action failed';
        _isSuccessBanner = false;
      }
    });

    _loadClubRoster();
  }

  void _showActionDialog(PlayerRegistration player, String actionType) {
    String targetClub = 'club-alpha-2';

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              backgroundColor: AppColors.surface,
              title: Text('Confirm ${actionType.toUpperCase()}'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Player: ${player.name} (${player.playerId})', style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  if (actionType != 'release') ...[
                    const Text('TARGET CLUB:', style: TextStyle(fontSize: 11, color: AppColors.textSecondary, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      initialValue: targetClub,
                      decoration: const InputDecoration(prefixIcon: Icon(Icons.shield_outlined)),
                      items: const [
                        DropdownMenuItem(value: 'club-alpha-2', child: Text('Alpha Club 2')),
                        DropdownMenuItem(value: 'club-beta-1', child: Text('Beta Club 1')),
                      ],
                      onChanged: (val) {
                        if (val != null) setDialogState(() => targetClub = val);
                      },
                    ),
                  ] else ...[
                    const Text('Are you sure you want to release this player from the squad?'),
                  ],
                ],
              ),
              actions: [
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: actionType == 'release' ? AppColors.error : AppColors.primary,
                    foregroundColor: AppColors.textInverse,
                  ),
                  onPressed: () {
                    Navigator.pop(ctx);
                    _performRosterAction(
                      actionType: actionType,
                      player: player,
                      targetClubId: targetClub,
                    );
                  },
                  child: Text('Confirm $actionType'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SyncBar(),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
              : RefreshIndicator(
                  color: AppColors.primary,
                  backgroundColor: AppColors.surface,
                  onRefresh: _loadClubRoster,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildHeader(),
                      const SizedBox(height: 16),
                      if (_statusBanner != null) ...[
                        _buildStatusBanner(),
                        const SizedBox(height: 16),
                      ],
                      _buildPlayersList(),
                    ],
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.badge_rounded, color: AppColors.primary, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ROSTER OPERATIONS',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                ),
                Text(
                  'Managing: ${_club?.name ?? "Alpha Club 1"} (${_club?.roster.length ?? 0} active)',
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: _isSuccessBanner ? AppColors.primary.withValues(alpha: 0.12) : AppColors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: _isSuccessBanner ? AppColors.primary : AppColors.error,
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Icon(
            _isSuccessBanner ? Icons.check_circle_rounded : Icons.error_outline_rounded,
            color: _isSuccessBanner ? AppColors.primary : AppColors.error,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _statusBanner!,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: _isSuccessBanner ? AppColors.primary : AppColors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlayersList() {
    final roster = _club?.roster ?? [];

    if (roster.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: const Center(
          child: Text('No players registered in roster.', style: TextStyle(color: AppColors.textSecondary)),
        ),
      );
    }

    return Column(
      children: roster.map((player) => _buildPlayerCard(player)).toList(),
    );
  }

  Widget _buildPlayerCard(PlayerRegistration player) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppColors.surfaceElevated,
                  child: Text(
                    player.name.isNotEmpty ? player.name[0] : 'P',
                    style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(player.name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                      Text('${player.position ?? "Player"} • ID: ${player.playerId}', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    (player.registrationType ?? 'PERMANENT').toUpperCase(),
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.primary),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(color: AppColors.borderSubtle, height: 1),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: const Size(64, 34),
                  ),
                  onPressed: () => _showActionDialog(player, 'transfer'),
                  child: const Text('Transfer'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: const Size(64, 34),
                  ),
                  onPressed: () => _showActionDialog(player, 'loan'),
                  child: const Text('Loan'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: const Size(64, 34),
                  ),
                  onPressed: () => _showActionDialog(player, 'release'),
                  child: const Text('Release'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
