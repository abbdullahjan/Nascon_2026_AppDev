import 'package:flutter/material.dart';
import '../screens/admin_dashboard_screen.dart';
import '../screens/clubs_screen.dart';
import '../screens/fixtures_screen.dart';
import '../screens/leagues_screen.dart';
import '../screens/my_club_screen.dart';
import '../screens/my_profile_screen.dart';
import '../screens/roster_management_screen.dart';
import '../screens/scoring_entry_screen.dart';
import '../screens/standings_screen.dart';
import '../screens/store_screen.dart';

/// Tab definition representing a bottom navigation item.
class RoleTabDefinition {
  final String label;
  final IconData icon;
  final WidgetBuilder builder;

  const RoleTabDefinition({
    required this.label,
    required this.icon,
    required this.builder,
  });
}

/// Central RBAC Permissions Matrix.
/// Maps each user role to its allowed bottom navigation tabs and default home tab.
/// Adding or editing tabs only requires modifying this single file.
class RolePermissions {
  /// Default home tab label per role
  static const Map<String, String> defaultHomeTabs = {
    'super_admin': 'Admin',
    'league_organizer': 'Fixtures',
    'club_manager': 'My Club',
    'player': 'My Profile',
    'viewer': 'Fixtures',
  };

  /// Role to tabs definition table
  static final Map<String, List<RoleTabDefinition>> roleTabs = {
    // Super Admin: Fixtures, Standings, Leagues, Clubs, Store, Admin
    'super_admin': [
      RoleTabDefinition(
        label: 'Fixtures',
        icon: Icons.sports_rounded,
        builder: (_) => const FixturesScreen(),
      ),
      RoleTabDefinition(
        label: 'Standings',
        icon: Icons.leaderboard_rounded,
        builder: (_) => const StandingsScreen(),
      ),
      RoleTabDefinition(
        label: 'Leagues',
        icon: Icons.emoji_events_rounded,
        builder: (_) => const LeaguesScreen(),
      ),
      RoleTabDefinition(
        label: 'Clubs',
        icon: Icons.shield_rounded,
        builder: (_) => const ClubsScreen(),
      ),
      RoleTabDefinition(
        label: 'Store',
        icon: Icons.shopping_bag_outlined,
        builder: (_) => const StoreScreen(),
      ),
      RoleTabDefinition(
        label: 'Admin',
        icon: Icons.admin_panel_settings_rounded,
        builder: (_) => const AdminDashboardScreen(),
      ),
    ],

    // League Organizer: Fixtures, Standings, Scoring Entry, Leagues
    'league_organizer': [
      RoleTabDefinition(
        label: 'Fixtures',
        icon: Icons.sports_rounded,
        builder: (_) => const FixturesScreen(),
      ),
      RoleTabDefinition(
        label: 'Standings',
        icon: Icons.leaderboard_rounded,
        builder: (_) => const StandingsScreen(),
      ),
      RoleTabDefinition(
        label: 'Scoring Entry',
        icon: Icons.scoreboard_rounded,
        builder: (_) => const ScoringEntryScreen(),
      ),
      RoleTabDefinition(
        label: 'Leagues',
        icon: Icons.emoji_events_rounded,
        builder: (_) => const LeaguesScreen(),
      ),
    ],

    // Club Manager: My Club, Roster Management, Fixtures, Store
    'club_manager': [
      RoleTabDefinition(
        label: 'My Club',
        icon: Icons.store_mall_directory_rounded,
        builder: (_) => const MyClubScreen(),
      ),
      RoleTabDefinition(
        label: 'Roster Management',
        icon: Icons.groups_rounded,
        builder: (_) => const RosterManagementScreen(),
      ),
      RoleTabDefinition(
        label: 'Fixtures',
        icon: Icons.sports_rounded,
        builder: (_) => const FixturesScreen(),
      ),
      RoleTabDefinition(
        label: 'Store',
        icon: Icons.shopping_bag_outlined,
        builder: (_) => const StoreScreen(),
      ),
    ],

    // Player: Fixtures, Standings, My Profile
    'player': [
      RoleTabDefinition(
        label: 'Fixtures',
        icon: Icons.sports_rounded,
        builder: (_) => const FixturesScreen(),
      ),
      RoleTabDefinition(
        label: 'Standings',
        icon: Icons.leaderboard_rounded,
        builder: (_) => const StandingsScreen(),
      ),
      RoleTabDefinition(
        label: 'My Profile',
        icon: Icons.badge_rounded,
        builder: (_) => const MyProfileScreen(),
      ),
    ],

    // Viewer: Fixtures, Standings, Store
    'viewer': [
      RoleTabDefinition(
        label: 'Fixtures',
        icon: Icons.sports_rounded,
        builder: (_) => const FixturesScreen(),
      ),
      RoleTabDefinition(
        label: 'Standings',
        icon: Icons.leaderboard_rounded,
        builder: (_) => const StandingsScreen(),
      ),
      RoleTabDefinition(
        label: 'Store',
        icon: Icons.shopping_bag_outlined,
        builder: (_) => const StoreScreen(),
      ),
    ],
  };

  /// Returns the permitted tabs for a given role (defaults to viewer if unknown).
  static List<RoleTabDefinition> getTabsForRole(String role) {
    return roleTabs[role] ?? roleTabs['viewer']!;
  }

  /// Returns the index of the default home tab for a given role.
  static int getDefaultTabIndexForRole(String role) {
    final tabs = getTabsForRole(role);
    final targetLabel = defaultHomeTabs[role] ?? 'Fixtures';
    final idx = tabs.indexWhere((t) => t.label == targetLabel);
    return idx >= 0 ? idx : 0;
  }

  /// Checks whether a given tab label is permitted for the role.
  static bool isTabPermitted(String role, String tabLabel) {
    final tabs = getTabsForRole(role);
    return tabs.any((t) => t.label.toLowerCase() == tabLabel.toLowerCase());
  }
}
