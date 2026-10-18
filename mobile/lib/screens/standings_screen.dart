import 'package:flutter/material.dart';
import '../models/league.dart';
import '../models/standing.dart';
import '../services/api_service.dart';
import '../theme.dart';
import '../widgets/sync_bar.dart';

/// Screen 4: Standings Points Table Screen
/// Displays rule-driven league tables with head-to-head tiebreakers and qualification status.
class StandingsScreen extends StatefulWidget {
  const StandingsScreen({super.key});

  @override
  State<StandingsScreen> createState() => _StandingsScreenState();
}

class _StandingsScreenState extends State<StandingsScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  String? _errorMessage;

  List<LeagueModel> _leagues = [];
  String? _selectedLeagueId;
  LeagueStandings? _standings;

  @override
  void initState() {
    super.initState();
    _loadLeaguesAndStandings();
  }

  Future<void> _loadLeaguesAndStandings() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final leagues = await _apiService.getLeagues();
      if (!mounted) return;

      _leagues = leagues;
      if (_leagues.isNotEmpty && _selectedLeagueId == null) {
        _selectedLeagueId = _leagues.first.leagueId;
      }

      if (_selectedLeagueId != null) {
        _standings = await _apiService.getStandings(_selectedLeagueId!);
      }

      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Unable to load standings. Pull down to retry.';
        _isLoading = false;
      });
    }
  }

  Future<void> _onLeagueChanged(String leagueId) async {
    setState(() {
      _selectedLeagueId = leagueId;
      _isLoading = true;
    });

    try {
      final standings = await _apiService.getStandings(leagueId);
      if (!mounted) return;
      setState(() {
        _standings = standings;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SyncBar(),
        _buildLeagueSelector(),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            backgroundColor: AppColors.surface,
            onRefresh: _loadLeaguesAndStandings,
            child: _buildBody(),
          ),
        ),
      ],
    );
  }

  Widget _buildLeagueSelector() {
    if (_leagues.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 54,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _leagues.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final league = _leagues[index];
          final isSelected = league.leagueId == _selectedLeagueId;

          return ChoiceChip(
            selected: isSelected,
            onSelected: (_) => _onLeagueChanged(league.leagueId),
            label: Text(
              league.displayName,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                color: isSelected ? AppColors.textInverse : AppColors.textSecondary,
              ),
            ),
            selectedColor: AppColors.primary,
            backgroundColor: AppColors.surfaceElevated,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: BorderSide(
                color: isSelected ? AppColors.primary : AppColors.border,
                width: 1,
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 4),
          );
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline_rounded, size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              Text(_errorMessage!, style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Retry'),
                onPressed: _loadLeaguesAndStandings,
              ),
            ],
          ),
        ),
      );
    }

    final rows = _standings?.standings ?? [];

    if (rows.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.25),
          const Center(
            child: Column(
              children: [
                Icon(Icons.leaderboard_outlined, size: 54, color: AppColors.border),
                SizedBox(height: 12),
                Text(
                  'No standings available yet',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                ),
                SizedBox(height: 4),
                Text(
                  'Tables update live after scheduled fixtures are completed.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        _buildLeagueHeaderCard(),
        const SizedBox(height: 16),
        _buildStandingsTable(rows),
        const SizedBox(height: 16),
        _buildLegendCard(),
      ],
    );
  }

  Widget _buildLeagueHeaderCard() {
    final spots = _standings?.qualificationSpots ?? 1;

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
              color: AppColors.secondary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.emoji_events_rounded, color: AppColors.secondary, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _selectedLeagueId?.toUpperCase() ?? 'LEAGUE',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  'Sport: ${_standings?.sportId.toUpperCase() ?? "FOOTBALL"}',
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.primary.withValues(alpha: 0.4)),
            ),
            child: Row(
              children: [
                const Icon(Icons.star_rounded, color: AppColors.primary, size: 14),
                const SizedBox(width: 4),
                Text(
                  'Top $spots Qualifies',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStandingsTable(List<StandingRow> rows) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          // Table Column Headers
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: const BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
              border: Border(bottom: BorderSide(color: AppColors.border)),
            ),
            child: const Row(
              children: [
                SizedBox(width: 28, child: Text('#', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.textSecondary))),
                Expanded(child: Text('CLUB', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.textSecondary))),
                SizedBox(width: 28, child: Text('P', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary))),
                SizedBox(width: 28, child: Text('W', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary))),
                SizedBox(width: 28, child: Text('D', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary))),
                SizedBox(width: 28, child: Text('L', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary))),
                SizedBox(width: 34, child: Text('GD', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary))),
                SizedBox(width: 36, child: Text('PTS', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: AppColors.primary))),
              ],
            ),
          ),

          // Table Rows
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const Divider(color: AppColors.borderSubtle, height: 1),
            itemBuilder: (context, index) {
              final row = rows[index];
              return _buildTableRow(row, index);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildTableRow(StandingRow row, int index) {
    final spots = _standings?.qualificationSpots ?? 1;
    final isQualifying = row.rank <= spots;

    Color rankColor = AppColors.textSecondary;
    if (isQualifying) {
      rankColor = AppColors.primary;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      color: isQualifying ? AppColors.primary.withValues(alpha: 0.04) : Colors.transparent,
      child: Row(
        children: [
          // Rank with colored indicator strip
          SizedBox(
            width: 28,
            child: Row(
              children: [
                if (isQualifying)
                  Container(
                    width: 3,
                    height: 16,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                const SizedBox(width: 4),
                Text(
                  '${row.rank}',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                    color: rankColor,
                  ),
                ),
              ],
            ),
          ),

          // Club Name & Status Badge
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.teamName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: AppColors.textPrimary,
                  ),
                ),
                if (row.isClinched)
                  const Text('Clinched Playoff', style: TextStyle(fontSize: 10, color: AppColors.primary, fontWeight: FontWeight.w700))
                else if (row.isEliminated)
                  const Text('Eliminated', style: TextStyle(fontSize: 10, color: AppColors.error, fontWeight: FontWeight.w700)),
              ],
            ),
          ),

          // Match Stats
          SizedBox(width: 28, child: Text('${row.played}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
          SizedBox(width: 28, child: Text('${row.won}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
          SizedBox(width: 28, child: Text('${row.drawn}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
          SizedBox(width: 28, child: Text('${row.lost}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
          SizedBox(
            width: 34,
            child: Text(
              row.goalDifference > 0 ? '+${row.goalDifference}' : '${row.goalDifference}',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: row.goalDifference > 0 ? AppColors.secondary : (row.goalDifference < 0 ? AppColors.error : AppColors.textSecondary),
              ),
            ),
          ),
          SizedBox(
            width: 36,
            child: Text(
              '${row.points}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w900,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLegendCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderSubtle),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tie-Break Rule Order (Rule-Driven Spec)',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
          ),
          SizedBox(height: 6),
          Text(
            '1. Head-to-Head Points  →  2. H2H Goal Diff  →  3. Overall Diff  →  4. Goals Scored  →  5. Fair Play  →  6. Drawing of Lots (Seed 42)',
            style: TextStyle(fontSize: 11, color: AppColors.textSecondary, height: 1.4),
          ),
        ],
      ),
    );
  }
}
