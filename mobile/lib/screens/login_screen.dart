import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/secure_store.dart';
import '../theme.dart';
import 'role_home.dart';
import 'settings_screen.dart';

/// Screen 3: Login Screen
/// Implements email + password inputs, show/hide toggle, inline validation,
/// demo accounts quick-fill, backend rbac-matrix token fetch, fallback dummy token,
/// and saves credentials into flutter_secure_storage.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController(text: 'admin@nascon.test');
  final _passwordController = TextEditingController(text: 'Nascon@26');
  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _errorMessage;

  // The 5 official demo accounts and their mapped roles
  static const Map<String, String> _demoAccounts = {
    'admin@nascon.test': 'super_admin',
    'organizer@nascon.test': 'league_organizer',
    'manager@nascon.test': 'club_manager',
    'player@nascon.test': 'player',
    'viewer@nascon.test': 'viewer',
  };

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _fillAccount(String email) {
    setState(() {
      _emailController.text = email;
      _passwordController.text = 'Nascon@26';
      _errorMessage = null;
    });
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    setState(() {
      _errorMessage = null;
    });

    if (email.isEmpty || password.isEmpty) {
      setState(() {
        _errorMessage = 'Please enter both your email address and password.';
      });
      return;
    }

    // Check against official demo accounts
    final role = _demoAccounts[email.toLowerCase()];
    if (role == null || password != 'Nascon@26') {
      setState(() {
        _errorMessage = 'Invalid email or password';
      });
      return;
    }

    setState(() {
      _isLoading = true;
    });

    String? token;

    try {
      // Call POST {baseUrl}/audit/v1/rbac-matrix
      final matrix = await ApiClient().fetchRbacMatrix();
      if (matrix != null && matrix['tokens'] is Map) {
        final tokens = matrix['tokens'] as Map;
        if (tokens[role] != null) {
          token = tokens[role].toString();
        }
      }
    } catch (_) {
      // Network unreachable
    }

    // Fallback: If server is unreachable, store a dummy token so the UI can still be tested
    token ??= 'dummy_token_${role}_nascon26';

    // Store the JWT and role in flutter_secure_storage (never shared_preferences)
    await SecureStore.saveAuth(
      jwt: token,
      role: role,
      email: email,
    );

    if (!mounted) return;
    setState(() {
      _isLoading = false;
    });

    // Navigate to the role's home screen
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => RoleHomeScreen(role: role)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sign In'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings & Server URL',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // App Emblem
                  Center(
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: AppColors.primaryMuted,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.primary, width: 1.5),
                      ),
                      child: const Icon(
                        Icons.sports_soccer_rounded,
                        color: AppColors.primary,
                        size: 34,
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    "NaSCon '26",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Multi-Sport League & Club Operations',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Email
                  const Text(
                    'Email Address',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      hintText: 'user@nascon.test',
                      prefixIcon: Icon(Icons.email_outlined, size: 20),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Password
                  const Text(
                    'Password',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _handleLogin(),
                    decoration: InputDecoration(
                      hintText: '••••••••',
                      prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          size: 20,
                        ),
                        tooltip:
                            _obscurePassword ? 'Show password' : 'Hide password',
                        onPressed: () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                      ),
                    ),
                  ),

                  // Plain-Language Error
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: AppColors.error.withValues(alpha: 0.4),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline_rounded,
                            color: AppColors.error,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: const TextStyle(
                                color: AppColors.error,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 24),

                  // Sign In Button
                  ElevatedButton(
                    onPressed: _isLoading ? null : _handleLogin,
                    child: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.black),
                            ),
                          )
                        : const Text('Sign In to Platform'),
                  ),
                  const SizedBox(height: 28),

                  // Demo Accounts Quick Selection
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(
                                Icons.badge_outlined,
                                size: 16,
                                color: AppColors.textSecondary,
                              ),
                              SizedBox(width: 6),
                              Text(
                                'Demo Accounts (Tap to test role)',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _demoChip('Super Admin', 'admin@nascon.test'),
                              _demoChip('Organizer', 'organizer@nascon.test'),
                              _demoChip('Manager', 'manager@nascon.test'),
                              _demoChip('Player', 'player@nascon.test'),
                              _demoChip('Viewer', 'viewer@nascon.test'),
                            ],
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            'Password: Nascon@26 for all accounts',
                            style: TextStyle(
                              fontSize: 11,
                              color: AppColors.textTertiary,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _demoChip(String roleName, String email) {
    final isSelected = _emailController.text == email;
    return ActionChip(
      avatar: Icon(
        Icons.person_pin_circle_rounded,
        size: 14,
        color: isSelected ? AppColors.primary : AppColors.textSecondary,
      ),
      label: Text(
        '$roleName ($email)',
        style: TextStyle(
          fontSize: 11,
          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          color: isSelected ? AppColors.primary : AppColors.textPrimary,
        ),
      ),
      onPressed: () => _fillAccount(email),
    );
  }
}
