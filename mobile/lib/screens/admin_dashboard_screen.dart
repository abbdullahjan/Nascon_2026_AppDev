import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../theme.dart';
import '../widgets/sync_bar.dart';

/// Screen: Admin Dashboard (For Platform Super-Admin)
/// Platform-wide operations, system health, and benchmark reseeding.
class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  bool _isResetting = false;
  String? _statusMessage;

  int _clubsCount = 0;
  int _leaguesCount = 0;
  int _matchesCount = 0;
  int _productsCount = 0;

  @override
  void initState() {
    super.initState();
    _loadMetrics();
  }

  Future<void> _loadMetrics() async {
    setState(() => _isLoading = true);
    try {
      final clubs = await _apiService.getClubs();
      final leagues = await _apiService.getLeagues();
      final matches = await _apiService.getMatches();
      final products = await _apiService.getProducts();

      if (!mounted) return;
      setState(() {
        _clubsCount = clubs.length;
        _leaguesCount = leagues.length;
        _matchesCount = matches.length;
        _productsCount = products.length;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _triggerReset() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Confirm Database Reset'),
        content: const Text(
          'This will trigger POST /audit/v1/reset with seed: 42, wiping transaction state and restoring canonical competition test vectors.',
        ),
        actions: [
          OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reset DB'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isResetting = true);
      final ok = await _apiService.resetData(seed: 42);
      if (!mounted) return;
      setState(() {
        _isResetting = false;
        _statusMessage = ok ? 'Database successfully reset to canonical seed 42!' : 'Reset failed';
      });
      _loadMetrics();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SyncBar(),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildOverviewCard(),
                    const SizedBox(height: 16),
                    if (_statusMessage != null) ...[
                      _buildStatusCard(),
                      const SizedBox(height: 16),
                    ],
                    _buildMetricsGrid(),
                    const SizedBox(height: 16),
                    _buildDatabaseControlsCard(),
                  ],
                ),
        ),
      ],
    );
  }

  Widget _buildOverviewCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.3)),
        gradient: LinearGradient(
          colors: [
            AppColors.gold.withValues(alpha: 0.08),
            AppColors.surface,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: Color(0xFF3E2F14),
            child: Icon(Icons.admin_panel_settings_rounded, size: 30, color: AppColors.gold),
          ),
          SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('PLATFORM SUPER-ADMIN', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.gold)),
                SizedBox(height: 2),
                Text('NaSCon \'26 Operations', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                Text('admin@nascon.test • Cross-Tenant Access', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusCard() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.primary),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_rounded, color: AppColors.primary, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(_statusMessage!, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13))),
        ],
      ),
    );
  }

  Widget _buildMetricsGrid() {
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.5,
      children: [
        _buildStatTile('Leagues', '$_leaguesCount Active', Icons.emoji_events_rounded, AppColors.secondary),
        _buildStatTile('Clubs', '$_clubsCount Registered', Icons.shield_rounded, AppColors.primary),
        _buildStatTile('Fixtures', '$_matchesCount Matches', Icons.sports_soccer_rounded, AppColors.gold),
        _buildStatTile('Merchandise', '$_productsCount Products', Icons.shopping_bag_rounded, const Color(0xFFCE93D8)),
      ],
    );
  }

  Widget _buildStatTile(String title, String subtitle, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 6),
              Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 6),
          Text(subtitle, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
        ],
      ),
    );
  }

  Widget _buildDatabaseControlsCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('GRADER AUDIT & RE-SEED CONTROLS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
          const SizedBox(height: 6),
          const Text(
            'Calls POST /audit/v1/reset to restore initial canonical test vectors, stocks, and seeded demo accounts.',
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              icon: _isResetting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.error))
                  : const Icon(Icons.restore_rounded, size: 18),
              label: Text(_isResetting ? 'Resetting Database...' : 'Re-seed Database (POST /audit/v1/reset)'),
              onPressed: _isResetting ? null : _triggerReset,
            ),
          ),
        ],
      ),
    );
  }
}
