import 'package:flutter/material.dart';
import '../core/permissions.dart';
import '../core/secure_store.dart';
import '../theme.dart';
import '../widgets/no_permission.dart';
import '../widgets/role_badge.dart';
import 'login_screen.dart';
import 'settings_screen.dart';

/// Screen 4: Role Home Screen
/// Reads the logged-in role, dynamically constructs the permitted bottom navigation
/// tabs from permissions.dart, sets the default home tab, and provides the top bar
/// with title, role badge, settings icon, and logout confirmation.
class RoleHomeScreen extends StatefulWidget {
  const RoleHomeScreen({super.key, required this.role});

  final String role;

  @override
  State<RoleHomeScreen> createState() => _RoleHomeScreenState();
}

class _RoleHomeScreenState extends State<RoleHomeScreen> {
  late int _currentIndex;
  late List<RoleTabDefinition> _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = RolePermissions.getTabsForRole(widget.role);
    _currentIndex = RolePermissions.getDefaultTabIndexForRole(widget.role);
  }

  Future<void> _confirmLogout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Row(
          children: [
            Icon(Icons.logout_rounded, color: AppColors.error, size: 22),
            SizedBox(width: 10),
            Text('Confirm Logout'),
          ],
        ),
        content: const Text(
          'Are you sure you want to end your current session?',
          style: TextStyle(fontSize: 14),
        ),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Log Out'),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      await SecureStore.clearAuth();
      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_tabs.isEmpty) {
      return const NoPermissionScreen(resourceName: 'Home');
    }

    final currentTab = _tabs[_currentIndex];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            Expanded(
              child: Text(
                currentTab.label,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.2,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            RoleBadge(role: widget.role),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, size: 22),
            tooltip: 'Settings',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded, size: 22),
            tooltip: 'Log out',
            onPressed: _confirmLogout,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: _tabs.map((tab) => tab.builder(context)).toList(),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        type: BottomNavigationBarType.fixed, // Cleanly handles 3-6 items without shift
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textSecondary,
        selectedLabelStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
        onTap: (index) {
          if (index >= 0 && index < _tabs.length) {
            setState(() {
              _currentIndex = index;
            });
          }
        },
        items: _tabs.map((tab) {
          return BottomNavigationBarItem(
            icon: Icon(tab.icon),
            activeIcon: Icon(tab.icon, color: AppColors.primary),
            label: tab.label,
            tooltip: tab.label,
          );
        }).toList(),
      ),
    );
  }
}
