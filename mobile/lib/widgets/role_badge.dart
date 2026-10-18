import 'package:flutter/material.dart';
import '../theme.dart';

/// Reusable Role Badge shown in the app top bar.
/// Always shows Icon + Text for accessibility and high contrast.
class RoleBadge extends StatelessWidget {
  const RoleBadge({super.key, required this.role});

  final String role;

  static String getDisplayName(String role) {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'league_organizer':
        return 'League Organizer';
      case 'club_manager':
        return 'Club Manager';
      case 'player':
        return 'Player';
      case 'viewer':
        return 'Viewer';
      default:
        return role;
    }
  }

  static IconData getIcon(String role) {
    switch (role) {
      case 'super_admin':
        return Icons.security_rounded;
      case 'league_organizer':
        return Icons.emoji_events_rounded;
      case 'club_manager':
        return Icons.shield_rounded;
      case 'player':
        return Icons.person_rounded;
      default:
        return Icons.visibility_rounded;
    }
  }

  static Color getColor(String role) {
    switch (role) {
      case 'super_admin':
        return AppColors.gold;
      case 'league_organizer':
        return AppColors.primary;
      case 'club_manager':
        return AppColors.secondary;
      case 'player':
        return const Color(0xFFCE93D8);
      default:
        return AppColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = getColor(role);
    final icon = getIcon(role);
    final label = getDisplayName(role);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.4), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}
