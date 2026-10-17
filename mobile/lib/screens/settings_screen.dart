import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';
import 'login_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _urlCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _urlCtrl = TextEditingController(text: AppStateScope.of(context).serverUrl);
  }

  @override
  void dispose() { _urlCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // Account section
        const SectionTitle('Account'),
        const SizedBox(height: 10),
        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            TeamAvatar(state.userName, size: 44),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(state.userName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 2),
              StatusBadge(state.role.toUpperCase().replaceAll('_', ' ')),
            ])),
          ]),
          const SizedBox(height: 14),
          GhostButton(
            label: 'Sign Out',
            icon: Icons.logout_rounded,
            onPressed: () async {
              await state.logout();
              if (!mounted) return;
              Navigator.pushAndRemoveUntil(context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
            },
          ),
        ])),
        const SizedBox(height: 20),

        // Server connection
        const SectionTitle('Backend Connection'),
        const SizedBox(height: 10),
        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 8, height: 8,
                decoration: BoxDecoration(
                  color: state.online ? kGreen : kOrange,
                  shape: BoxShape.circle,
                )),
            const SizedBox(width: 8),
            Text(state.online ? 'Connected' : 'Offline',
                style: TextStyle(fontWeight: FontWeight.w700,
                    color: state.online ? kGreen : kOrange)),
          ]),
          const SizedBox(height: 12),
          TextField(
            controller: _urlCtrl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'API Base URL',
              hintText: 'http://10.0.2.2:8080',
              prefixIcon: Icon(Icons.link_rounded),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Android emulator: http://10.0.2.2:8080\nPhysical device: http://YOUR_LAN_IP:8080',
            style: TextStyle(color: kMuted, fontSize: 10, height: 1.5),
          ),
          const SizedBox(height: 12),
          PrimaryButton(
            label: 'Save & Test',
            icon: Icons.wifi_tethering_rounded,
            loading: _saving,
            onPressed: () async {
              setState(() => _saving = true);
              await state.setServerUrl(_urlCtrl.text);
              if (!mounted) return;
              setState(() => _saving = false);
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(state.online ? 'Backend connected ✓' : 'Cannot reach server — check URL')));
            },
          ),
        ])),
        const SizedBox(height: 20),

        // Demo accounts reference
        const SectionTitle('Demo Accounts'),
        const SizedBox(height: 10),
        Panel(child: Column(children: [
          ...[
            ('Platform Super-Admin', 'admin@nascon.test'),
            ('League Organizer', 'organizer@nascon.test'),
            ('Club Manager', 'manager@nascon.test'),
            ('Player', 'player@nascon.test'),
            ('General Viewer', 'viewer@nascon.test'),
          ].map((a) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [
              Expanded(child: Text(a.$1, style: const TextStyle(color: kMuted, fontSize: 12, fontWeight: FontWeight.w600))),
              Text(a.$2, style: const TextStyle(color: kGold, fontSize: 11)),
            ]),
          )),
          const SizedBox(height: 6),
          const Text('All use password: Nascon@26', style: TextStyle(color: kBorder, fontSize: 10)),
        ])),
        const SizedBox(height: 20),

        // About
        Panel(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Eyebrow('About'),
          const SizedBox(height: 8),
          const Text("NEXUS · NaSCon '26", style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
          const SizedBox(height: 4),
          const Text('Multi-sport league & club operations platform.\nBuilt for the NaSCon \'26 App Dev Competition.',
              style: TextStyle(color: kMuted, fontSize: 11, height: 1.5)),
          const SizedBox(height: 8),
          const Text('v1.0.0 · Day 1 Sprint', style: TextStyle(color: kBorder, fontSize: 10)),
        ])),
      ]),
    );
  }
}
