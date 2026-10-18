import 'package:flutter/material.dart';
import '../core/secure_store.dart';
import '../theme.dart';
import '../widgets/sync_bar.dart';

/// Screen: My Profile (For Player role)
/// Displays athlete profile, squad affiliation, and player identity.
class MyProfileScreen extends StatefulWidget {
  const MyProfileScreen({super.key});

  @override
  State<MyProfileScreen> createState() => _MyProfileScreenState();
}

class _MyProfileScreenState extends State<MyProfileScreen> {
  String _email = 'player@nascon.test';
  String _role = 'player';
  String _userId = 'player-alpha-1';

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final email = await SecureStore.getEmail();
    final role = await SecureStore.getRole();
    final userId = await SecureStore.getUserId();

    if (!mounted) return;
    setState(() {
      if (email != null && email.isNotEmpty) _email = email;
      if (role != null && role.isNotEmpty) _role = role;
      if (userId != null && userId.isNotEmpty) _userId = userId;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SyncBar(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildProfileHeader(),
              const SizedBox(height: 16),
              _buildAffiliationCard(),
              const SizedBox(height: 16),
              _buildStatsCard(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildProfileHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 32,
            backgroundColor: Color(0xFF3B2A4A),
            child: Icon(Icons.person_rounded, size: 36, color: Color(0xFFCE93D8)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFCE93D8).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _role.toUpperCase(),
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFFCE93D8)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  _email.split('@').first.toUpperCase(),
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                ),
                Text(_email, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                Text('Athlete ID: $_userId', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAffiliationCard() {
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
          const Row(
            children: [
              Icon(Icons.shield_rounded, color: AppColors.secondary, size: 20),
              SizedBox(width: 8),
              Text('Club & Squad Affiliation', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 14),
          _buildInfoRow('Club', 'Alpha Club 1 (club-alpha-1)'),
          const Divider(color: AppColors.borderSubtle, height: 16),
          _buildInfoRow('Squad', 'Alpha 1 First Team (squad-alpha-1)'),
          const Divider(color: AppColors.borderSubtle, height: 16),
          _buildInfoRow('League', 'league-alpha-1'),
          const Divider(color: AppColors.borderSubtle, height: 16),
          _buildInfoRow('Tenant', 'tenant-alpha'),
        ],
      ),
    );
  }

  Widget _buildStatsCard() {
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
          const Row(
            children: [
              Icon(Icons.sports_rounded, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text('Contract & Roster Status', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 14),
          _buildInfoRow('Position', 'Forward'),
          const Divider(color: AppColors.borderSubtle, height: 16),
          _buildInfoRow('Role', 'Starter / Captain'),
          const Divider(color: AppColors.borderSubtle, height: 16),
          _buildInfoRow('Registration Type', 'Permanent Transfer'),
          const Divider(color: AppColors.borderSubtle, height: 16),
          _buildInfoRow('Eligibility', 'Active / Cleared'),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      ],
    );
  }
}
