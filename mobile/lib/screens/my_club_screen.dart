import 'package:flutter/material.dart';
import '../models/club.dart';
import '../services/api_service.dart';
import '../theme.dart';
import '../widgets/sync_bar.dart';

/// Screen: Club Profile / My Club
/// Shows club branding, home venue, squads, and registered player roster.
class MyClubScreen extends StatefulWidget {
  final String? clubId;
  final bool showBackButton;

  const MyClubScreen({
    super.key,
    this.clubId,
    this.showBackButton = false,
  });

  @override
  State<MyClubScreen> createState() => _MyClubScreenState();
}

class _MyClubScreenState extends State<MyClubScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  String? _errorMessage;
  ClubModel? _club;

  String get _activeClubId => widget.clubId ?? 'club-alpha-1';

  @override
  void initState() {
    super.initState();
    _loadClubDetails();
  }

  Future<void> _loadClubDetails() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final club = await _apiService.getClubDetail(_activeClubId);
      if (!mounted) return;
      setState(() {
        _club = club;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Unable to load club details.';
        _isLoading = false;
      });
    }
  }

  Color _parseColor(String hex, Color fallback) {
    try {
      final clean = hex.replaceAll('#', '');
      if (clean.length == 6) {
        return Color(int.parse('0xFF$clean'));
      }
    } catch (_) {}
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final content = Column(
      children: [
        if (!widget.showBackButton) const SyncBar(),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            backgroundColor: AppColors.surface,
            onRefresh: _loadClubDetails,
            child: _buildBody(),
          ),
        ),
      ],
    );

    if (widget.showBackButton) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text(
            _club?.name ?? 'Club Profile',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ),
        body: content,
      );
    }

    return content;
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }

    if (_errorMessage != null || _club == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline_rounded, size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              Text(_errorMessage ?? 'Club not found', style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Retry'),
                onPressed: _loadClubDetails,
              ),
            ],
          ),
        ),
      );
    }

    final club = _club!;
    final primaryColor = _parseColor(club.meta.primaryColor, AppColors.secondary);
    final secondaryColor = _parseColor(club.meta.secondaryColor, AppColors.gold);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        _buildHeroBanner(club, primaryColor, secondaryColor),
        const SizedBox(height: 16),
        _buildVenueCard(club),
        const SizedBox(height: 16),
        _buildRosterSection(club),
      ],
    );
  }

  Widget _buildHeroBanner(ClubModel club, Color primaryColor, Color secondaryColor) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: primaryColor.withValues(alpha: 0.4), width: 1.5),
        gradient: LinearGradient(
          colors: [
            primaryColor.withValues(alpha: 0.15),
            AppColors.surface,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: primaryColor.withValues(alpha: 0.25),
                child: Text(
                  club.name.isNotEmpty ? club.name[0] : 'C',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: primaryColor),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        club.tenantId.toUpperCase(),
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.textSecondary),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      club.name,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                    ),
                    Text(
                      'ID: ${club.clubId}',
                      style: const TextStyle(fontSize: 12, color: AppColors.textTertiary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(color: AppColors.borderSubtle, height: 1),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatItem('Roster Players', '${club.roster.isNotEmpty ? club.roster.length : club.playersCount}'),
              Container(width: 1, height: 24, color: AppColors.border),
              _buildStatItem('Squads', '${club.squadsCount}'),
              Container(width: 1, height: 24, color: AppColors.border),
              _buildStatItem('City', club.meta.city),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primary)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
      ],
    );
  }

  Widget _buildVenueCard(ClubModel club) {
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
              color: AppColors.gold.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.stadium_rounded, color: AppColors.gold, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Official Home Venue', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
                const SizedBox(height: 2),
                Text(
                  club.meta.venue,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                ),
                Text(club.meta.city, style: const TextStyle(fontSize: 12, color: AppColors.textTertiary)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRosterSection(ClubModel club) {
    final roster = club.roster;

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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.groups_rounded, color: AppColors.secondary, size: 20),
                  SizedBox(width: 8),
                  Text('Squad Roster', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${roster.length} Registered',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (roster.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text('No players registered in roster yet.', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: roster.length,
              separatorBuilder: (_, __) => const Divider(color: AppColors.borderSubtle, height: 12),
              itemBuilder: (context, index) {
                final player = roster[index];
                return _buildPlayerRow(player, index);
              },
            ),
        ],
      ),
    );
  }

  Widget _buildPlayerRow(PlayerRegistration player, int index) {
    final isLoan = player.registrationType == 'loan';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text(
                '#${index + 1}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.primary),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  player.name,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                ),
                Text(
                  '${player.position ?? "Player"} • ID: ${player.playerId}',
                  style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
                ),
              ],
            ),
          ),
          if (isLoan)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text('ON LOAN', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.warning)),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                (player.role ?? 'PLAYER').toUpperCase(),
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.primary),
              ),
            ),
        ],
      ),
    );
  }
}
