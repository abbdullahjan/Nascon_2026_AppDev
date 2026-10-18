import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/secure_store.dart';
import '../theme.dart';
import 'login_screen.dart';
import 'role_home.dart';
import 'settings_screen.dart';

/// Screen 1: Splash Screen
/// Calls GET {baseUrl}/health with a spinner.
/// - Success -> goes to Login (or straight to role home if a saved JWT exists).
/// - Failure -> "Cannot reach server", a Retry button, and a settings icon.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  bool _isChecking = true;
  bool _hasError = false;
  String _serverUrl = ApiClient.defaultBaseUrl;

  @override
  void initState() {
    super.initState();
    _checkServerAndAuth();
  }

  Future<void> _checkServerAndAuth() async {
    setState(() {
      _isChecking = true;
      _hasError = false;
    });

    _serverUrl = await ApiClient().getBaseUrl();
    final isHealthy = await ApiClient().checkHealth();

    if (!mounted) return;

    if (isHealthy) {
      // Check if user has an existing saved JWT session
      final hasToken = await SecureStore.hasSavedToken();
      final savedRole = await SecureStore.getRole();

      if (!mounted) return;

      if (hasToken && savedRole != null && savedRole.isNotEmpty) {
        // Go straight to the role home
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => RoleHomeScreen(role: savedRole)),
        );
      } else {
        // Go to Login
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
      }
    } else {
      setState(() {
        _isChecking = false;
        _hasError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, size: 24),
            tooltip: 'Configure Server URL',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
              _checkServerAndAuth();
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // App Logo Emblem
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.primaryMuted,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.primary, width: 2),
                  ),
                  child: const Icon(
                    Icons.sports_soccer_rounded,
                    color: AppColors.primary,
                    size: 44,
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  "NaSCon '26",
                  style: TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Sports League & Club Platform',
                  style: TextStyle(
                    fontSize: 14,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 48),

                if (_isChecking) ...[
                  const SizedBox(
                    width: 32,
                    height: 32,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(AppColors.primary),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Connecting to $_serverUrl...',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ] else if (_hasError) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.error.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.cloud_off_rounded,
                          color: AppColors.error,
                          size: 32,
                        ),
                        const SizedBox(height: 10),
                        const Text(
                          'Cannot reach server',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: AppColors.error,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Unable to reach the health endpoint at:\n$_serverUrl\n\nVerify that the backend service is running or update the server URL in settings.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ElevatedButton.icon(
                        icon: const Icon(Icons.refresh_rounded, size: 18),
                        label: const Text('Retry Connection'),
                        onPressed: _checkServerAndAuth,
                      ),
                      const SizedBox(width: 12),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.settings_outlined, size: 18),
                        label: const Text('Settings'),
                        onPressed: () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const SettingsScreen(),
                            ),
                          );
                          _checkServerAndAuth();
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                    label: const Text('Continue to Sign In (Offline / Demo Mode)'),
                    onPressed: () {
                      Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
