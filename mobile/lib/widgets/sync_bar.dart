import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import '../screens/pending_queue_screen.dart';
import '../theme.dart';

/// Screen 6 Shared Widget: Sync Status Bar
/// Shown at the top of every screen.
/// Monitors network state using connectivity_plus and displays:
/// "Online" (check icon) or "Offline" (cloud-off icon).
/// Icon + text, never color alone.
/// Tapping it opens the PendingQueueScreen placeholder.
class SyncBar extends StatefulWidget {
  const SyncBar({super.key});

  @override
  State<SyncBar> createState() => _SyncBarState();
}

class _SyncBarState extends State<SyncBar> {
  bool _isOnline = true;
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  @override
  void initState() {
    super.initState();
    _checkInitialConnectivity();
    _subscription = Connectivity().onConnectivityChanged.listen((results) {
      final isNowOnline = !results.contains(ConnectivityResult.none);
      if (mounted && isNowOnline != _isOnline) {
        setState(() {
          _isOnline = isNowOnline;
        });
      }
    });
  }

  Future<void> _checkInitialConnectivity() async {
    try {
      final results = await Connectivity().checkConnectivity();
      final isNowOnline = !results.contains(ConnectivityResult.none);
      if (mounted) {
        setState(() {
          _isOnline = isNowOnline;
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bg = _isOnline ? const Color(0xFF0D2818) : const Color(0xFF332009);
    final fg = _isOnline ? AppColors.primary : AppColors.warning;
    final icon =
        _isOnline ? Icons.check_circle_outline_rounded : Icons.cloud_off_rounded;
    final text = _isOnline ? 'Online' : 'Offline';

    return Tooltip(
      message: 'Tap to view pending sync actions',
      child: Material(
        color: bg,
        child: InkWell(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const PendingQueueScreen()),
            );
          },
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 38),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: fg.withValues(alpha: 0.3), width: 1),
              ),
            ),
            child: Row(
              children: [
                Icon(icon, color: fg, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    text,
                    style: TextStyle(
                      color: fg,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
                Text(
                  'Pending Queue',
                  style: TextStyle(
                    color: fg.withValues(alpha: 0.8),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  color: fg.withValues(alpha: 0.8),
                  size: 11,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
