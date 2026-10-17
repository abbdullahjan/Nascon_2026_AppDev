import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import 'login_screen.dart';
import 'app_shell.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _fade;
  String _status = 'Connecting…';
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _ctrl.forward();
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final state = AppStateScope.of(context);
    setState(() { _status = 'Loading…'; _failed = false; });

    // In demo mode health() always returns true — no server needed
    final ok = await ApiClient().health();
    if (!mounted) return;

    if (ok) {
      setState(() => _status = 'Ready');
      await Future.delayed(const Duration(milliseconds: 500));
      if (!mounted) return;
      if (state.isLoggedIn) {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const AppShell()));
      } else {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
      }
    } else {
      setState(() { _status = 'Cannot reach server'; _failed = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: FadeTransition(
        opacity: _fade,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Spacer(flex: 2),
                // Logo block
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    color: kGold,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(Icons.bolt_rounded, color: Colors.black, size: 42),
                ),
                const SizedBox(height: 24),
                const Text('NEXUS',
                    style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: kText, letterSpacing: 4)),
                const SizedBox(height: 6),
                const Text("NASCON '26 · LEAGUE OPERATIONS",
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: kMuted, letterSpacing: 2.5)),
                const Spacer(flex: 2),
                if (!_failed) ...[
                  const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: kGold),
                  ),
                  const SizedBox(height: 16),
                  Text(_status, style: const TextStyle(color: kMuted, fontSize: 12)),
                ] else ...[
                  const Icon(Icons.wifi_off_rounded, color: kOrange, size: 32),
                  const SizedBox(height: 12),
                  const Text('Cannot reach the backend server.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: kOrange, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  const Text('Check that docker compose is running on port 8080.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: kMuted, fontSize: 11)),
                  const SizedBox(height: 24),
                  Row(children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _check,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Retry'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: kGold,
                          side: const BorderSide(color: kGold),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.push(context,
                            MaterialPageRoute(builder: (_) => const _ServerSettingsScreen())),
                        icon: const Icon(Icons.settings_rounded),
                        label: const Text('Settings'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: kText,
                          side: const BorderSide(color: kBorder),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                  ]),
                ],
                const Spacer(),
                const Text('NaSCon · FAST-NUCES',
                    style: TextStyle(color: kBorder, fontSize: 10, letterSpacing: 1.5)),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Quick server settings reachable from splash ───────────────────────────
class _ServerSettingsScreen extends StatefulWidget {
  const _ServerSettingsScreen();
  @override
  State<_ServerSettingsScreen> createState() => _ServerSettingsScreenState();
}

class _ServerSettingsScreenState extends State<_ServerSettingsScreen> {
  late TextEditingController _ctrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final state = AppStateScope.of(context);
    _ctrl = TextEditingController(text: state.serverUrl);
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(title: const Text('Server settings')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('API Base URL', style: TextStyle(color: kMuted, fontSize: 12)),
          const SizedBox(height: 8),
          TextField(
            controller: _ctrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              hintText: 'http://10.0.2.2:8080',
              prefixIcon: Icon(Icons.link_rounded),
            ),
          ),
          const SizedBox(height: 6),
          const Text('Android emulator: http://10.0.2.2:8080\nPhysical device: http://YOUR_LAN_IP:8080',
              style: TextStyle(color: kMuted, fontSize: 11, height: 1.5)),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity, height: 50,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : () async {
                setState(() => _saving = true);
                await state.setServerUrl(_ctrl.text);
                if (!mounted) return;
                setState(() => _saving = false);
                final msg = state.online ? 'Connected ✓' : 'Could not reach server';
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
              },
              icon: _saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                  : const Icon(Icons.wifi_tethering_rounded),
              label: const Text('Save & test'),
              style: ElevatedButton.styleFrom(
                backgroundColor: kGold, foregroundColor: Colors.black,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
