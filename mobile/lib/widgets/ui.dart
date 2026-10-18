import 'package:flutter/material.dart';
import '../core/theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// CARD / PANEL
// ─────────────────────────────────────────────────────────────────────────────
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding, this.color});
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final Color? color;
  @override
  Widget build(BuildContext context) => Container(
    padding: padding ?? const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: color ?? kSurface,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: kBorder),
    ),
    child: child,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GOLD GRADIENT BANNER (champion-style header)
// ─────────────────────────────────────────────────────────────────────────────
class GoldBanner extends StatelessWidget {
  const GoldBanner({super.key, required this.child, this.height = 160});
  final Widget child;
  final double height;
  @override
  Widget build(BuildContext context) => Container(
    height: height,
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      gradient: const LinearGradient(
        colors: [Color(0xFF2A1F05), Color(0xFF1A1A1A)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      border: Border.all(color: kGold.withValues(alpha: 0.35)),
    ),
    child: child,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.color = kGold});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.15),
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: color.withValues(alpha: 0.4)),
    ),
    child: Text(
      label,
      style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────
Color matchStatusColor(String status) {
  switch (status.toLowerCase()) {
    case 'in_progress': return kGreen;
    case 'upcoming': return kBlue;
    case 'completed': return kMuted;
    case 'postponed': return kOrange;
    case 'abandoned': return kRed;
    case 'cancelled': return kRed;
    default: return kMuted;
  }
}

String matchStatusLabel(String status) {
  switch (status.toLowerCase()) {
    case 'in_progress': return 'LIVE';
    case 'upcoming': return 'UPCOMING';
    case 'completed': return 'FT';
    case 'postponed': return 'POSTPONED';
    case 'abandoned': return 'ABANDONED';
    case 'cancelled': return 'CANCELLED';
    default: return status.toUpperCase();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE PULSE DOT
// ─────────────────────────────────────────────────────────────────────────────
class LiveDot extends StatefulWidget {
  const LiveDot({super.key});
  @override
  State<LiveDot> createState() => _LiveDotState();
}
class _LiveDotState extends State<LiveDot> with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<double> _a;
  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
    _a = Tween<double>(begin: 0.4, end: 1.0).animate(_c);
  }
  @override
  void dispose() { _c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    builder: (_, __) => Container(
      width: 8, height: 8,
      decoration: BoxDecoration(
        color: kGreen.withValues(alpha: _a.value),
        shape: BoxShape.circle,
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION TITLE
// ─────────────────────────────────────────────────────────────────────────────
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Row(children: [
    Text(title.toUpperCase(),
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5, color: kMuted)),
    if (trailing != null) ...[const Spacer(), trailing!],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// EYEBROW LABEL
// ─────────────────────────────────────────────────────────────────────────────
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color = kGold});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 2, color: color),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADLINE TEXT
// ─────────────────────────────────────────────────────────────────────────────
class HeadlineText extends StatelessWidget {
  const HeadlineText(this.text, {super.key, this.size = 28});
  final String text;
  final double size;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(fontSize: size, fontWeight: FontWeight.w900, color: kText, letterSpacing: -0.5, height: 1.1),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY BUTTON (gold)
// ─────────────────────────────────────────────────────────────────────────────
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.icon, this.loading = false});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity, height: 50,
    child: ElevatedButton(
      onPressed: loading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: kGold,
        foregroundColor: Colors.black,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, letterSpacing: 0.3),
      ),
      child: loading
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
          : Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
              Text(label),
            ]),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GHOST BUTTON (outlined)
// ─────────────────────────────────────────────────────────────────────────────
class GhostButton extends StatelessWidget {
  const GhostButton({super.key, required this.label, required this.onPressed, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity, height: 50,
    child: OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: kText,
        side: BorderSide(color: kBorder),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
        Text(label),
      ]),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.subtitle});
  final IconData icon;
  final String title;
  final String? subtitle;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 32),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 40, color: kMuted),
      const SizedBox(height: 12),
      Text(title, textAlign: TextAlign.center,
          style: TextStyle(fontWeight: FontWeight.w700, color: kText, fontSize: 15)),
      if (subtitle != null) ...[
        const SizedBox(height: 6),
        Text(subtitle!, textAlign: TextAlign.center,
            style: TextStyle(color: kMuted, fontSize: 12, height: 1.5)),
      ],
    ]),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFLINE BANNER
// ─────────────────────────────────────────────────────────────────────────────
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, this.lastUpdated});
  final String? lastUpdated;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    color: kOrange.withValues(alpha: 0.12),
    child: Row(children: [
      const Icon(Icons.wifi_off_rounded, size: 14, color: kOrange),
      const SizedBox(width: 8),
      Expanded(child: Text(
        lastUpdated != null ? 'Offline — cached data from $lastUpdated' : 'Offline — viewing cached data',
        style: const TextStyle(color: kOrange, fontSize: 11, fontWeight: FontWeight.w600),
      )),
    ]),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALIFICATION BADGE
// ─────────────────────────────────────────────────────────────────────────────
class QualBadge extends StatelessWidget {
  const QualBadge(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) {
    Color color;
    String label;
    switch (status) {
      case 'clinched': color = kGreen; label = 'Q'; break;
      case 'eliminated': color = kRed; label = 'E'; break;
      default: return const SizedBox.shrink();
    }
    return Container(
      width: 18, height: 18,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        shape: BoxShape.circle,
        border: Border.all(color: color.withValues(alpha: 0.6)),
      ),
      child: Center(child: Text(label, style: TextStyle(color: color, fontSize: 8, fontWeight: FontWeight.w900))),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC STATUS CHIP (always visible)
// ─────────────────────────────────────────────────────────────────────────────
class SyncStatusChip extends StatelessWidget {
  const SyncStatusChip({super.key, required this.online, required this.syncing, required this.pendingCount, this.onTap});
  final bool online, syncing;
  final int pendingCount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    String label;
    Widget leading;
    if (syncing) {
      label = 'Syncing...';
      leading = const SizedBox(
        width: 8, height: 8,
        child: CircularProgressIndicator(strokeWidth: 1.5, color: kGold),
      );
    } else if (!online) {
      label = pendingCount > 0 ? 'Offline · $pendingCount pending' : 'Offline';
      leading = Container(
        width: 8, height: 8,
        decoration: const BoxDecoration(color: kOrange, shape: BoxShape.circle),
      );
    } else {
      label = pendingCount > 0 ? 'Online · $pendingCount pending' : 'Online';
      leading = Container(
        width: 8, height: 8,
        decoration: const BoxDecoration(color: kGreen, shape: BoxShape.circle),
      );
    }
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: kSurface2,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: kBorder),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          leading,
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: kText)),
        ]),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM AVATAR
// ─────────────────────────────────────────────────────────────────────────────
class TeamAvatar extends StatelessWidget {
  const TeamAvatar(this.name, {super.key, this.size = 44, this.color = kGold});
  final String name;
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: size, height: size,
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.12),
      shape: BoxShape.circle,
      border: Border.all(color: color.withValues(alpha: 0.3)),
    ),
    child: Center(child: Text(
      name.isNotEmpty ? name[0].toUpperCase() : '?',
      style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: size * 0.38),
    )),
  );
}
