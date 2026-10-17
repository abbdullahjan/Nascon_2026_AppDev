import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';
import 'app_shell.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _emailCtrl.text.trim();
    final pass = _passCtrl.text;
    if (email.isEmpty || pass.isEmpty) {
      setState(() => _error = 'Please fill in your email and password');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final state = AppStateScope.of(context);
      await state.login(email, pass);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const AppShell()));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(height: 40),
            // Logo
            Row(children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(color: kGold, borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.bolt_rounded, color: Colors.black, size: 26),
              ),
              const SizedBox(width: 12),
              const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('NEXUS', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2, color: kText)),
                Text("NASCON '26", style: TextStyle(fontSize: 9, color: kMuted, letterSpacing: 2.5, fontWeight: FontWeight.w700)),
              ]),
            ]),
            const SizedBox(height: 48),
            const Text('Welcome back', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: kText, letterSpacing: -0.5)),
            const SizedBox(height: 6),
            const Text('Sign in to your team account', style: TextStyle(color: kMuted, fontSize: 14)),
            const SizedBox(height: 36),

            // Email
            const Text('Email', style: TextStyle(color: kMuted, fontSize: 12, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                hintText: 'you@nascon.test',
                prefixIcon: Icon(Icons.alternate_email_rounded),
              ),
            ),
            const SizedBox(height: 16),

            // Password
            const Text('Password', style: TextStyle(color: kMuted, fontSize: 12, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _passCtrl,
              obscureText: _obscure,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _login(),
              decoration: InputDecoration(
                hintText: '••••••••',
                prefixIcon: const Icon(Icons.lock_outline_rounded),
                suffixIcon: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: kRed.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: kRed.withValues(alpha: 0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded, color: kRed, size: 16),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error!, style: const TextStyle(color: kRed, fontSize: 12))),
                ]),
              ),
            ],

            const SizedBox(height: 28),
            PrimaryButton(label: 'Sign In', icon: Icons.login_rounded, onPressed: _login, loading: _loading),
            const SizedBox(height: 40),

            // Demo accounts
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: kSurface2,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: kBorder),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Eyebrow('Demo accounts', color: kMuted),
                const SizedBox(height: 10),
                ...[
                  ('Super Admin', 'admin@nascon.test'),
                  ('Organizer', 'organizer@nascon.test'),
                  ('Club Manager', 'manager@nascon.test'),
                  ('Player', 'player@nascon.test'),
                  ('Viewer', 'viewer@nascon.test'),
                ].map((a) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: GestureDetector(
                    onTap: () {
                      _emailCtrl.text = a.$2;
                      _passCtrl.text = 'Nascon@26';
                    },
                    child: Row(children: [
                      Expanded(child: Text(a.$1,
                          style: const TextStyle(color: kMuted, fontSize: 11, fontWeight: FontWeight.w600))),
                      Text(a.$2, style: const TextStyle(color: kGold, fontSize: 11)),
                    ]),
                  ),
                )),
                const SizedBox(height: 6),
                const Text('Password: Nascon@26 · Tap a row to fill',
                    style: TextStyle(color: kBorder, fontSize: 10)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
