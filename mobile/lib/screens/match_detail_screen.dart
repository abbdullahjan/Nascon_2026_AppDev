import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../models/match.dart';
import '../models/product.dart';
import '../services/api_service.dart';
import '../theme.dart';

/// Screen 3: Match Detail Screen
/// Live score projection, event-sourced timeline, and pinned merchandise checkout.
class MatchDetailScreen extends StatefulWidget {
  final String? matchId;
  final MatchModel? initialMatch;

  const MatchDetailScreen({
    super.key,
    this.matchId,
    this.initialMatch,
  });

  @override
  State<MatchDetailScreen> createState() => _MatchDetailScreenState();
}

class _MatchDetailScreenState extends State<MatchDetailScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  String? _errorMessage;
  MatchModel? _match;
  List<MatchEventModel> _events = [];

  String get _activeMatchId => widget.matchId ?? widget.initialMatch?.matchId ?? 'match-alpha-1';

  @override
  void initState() {
    super.initState();
    _match = widget.initialMatch;
    _loadMatchDetails();
  }

  Future<void> _loadMatchDetails() async {
    setState(() {
      _isLoading = _match == null;
      _errorMessage = null;
    });

    try {
      final matchDetail = await _apiService.getMatchDetail(_activeMatchId);
      final events = await _apiService.getMatchEvents(_activeMatchId);

      if (!mounted) return;
      setState(() {
        if (matchDetail != null) {
          _match = matchDetail;
        }
        _events = events;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (_match == null) {
          _errorMessage = 'Unable to load match details.';
        }
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          _match != null ? '${_match!.homeTeamName} vs ${_match!.awayTeamName}' : 'Match Details',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh Score',
            onPressed: _loadMatchDetails,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }

    if (_errorMessage != null && _match == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline_rounded, size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              Text(_errorMessage!, style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadMatchDetails,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final match = _match!;

    return RefreshIndicator(
      color: AppColors.primary,
      backgroundColor: AppColors.surface,
      onRefresh: _loadMatchDetails,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildScoreboardHeader(match),
          const SizedBox(height: 16),
          if (match.pinnedProduct != null) ...[
            _buildPinnedProductCard(match.pinnedProduct!),
            const SizedBox(height: 16),
          ],
          _buildEventsTimelineSection(),
        ],
      ),
    );
  }

  Widget _buildScoreboardHeader(MatchModel match) {
    Color statusColor = AppColors.textSecondary;
    String statusLabel = 'Scheduled';

    if (match.isLive) {
      statusColor = AppColors.primary;
      statusLabel = '● LIVE IN PROGRESS';
    } else if (match.isCompleted) {
      statusColor = AppColors.secondary;
      statusLabel = 'FULL TIME MATCH RESULT';
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: match.isLive ? AppColors.primary.withValues(alpha: 0.3) : AppColors.border,
          width: 1.5,
        ),
        boxShadow: [
          if (match.isLive)
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.08),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
        ],
      ),
      child: Column(
        children: [
          // League & Sport Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${match.sportId.toUpperCase()} • ${match.leagueId}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Teams & Big Score
          Row(
            children: [
              // Home Team
              Expanded(
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: AppColors.surfaceElevated,
                      child: Text(
                        match.homeTeamName.isNotEmpty ? match.homeTeamName[0] : 'H',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      match.homeTeamName,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),

              // Score Numbers
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  match.score != null
                      ? '${match.score!.homeScore}   :   ${match.score!.awayScore}'
                      : 'VS',
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),

              // Away Team
              Expanded(
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: AppColors.surfaceElevated,
                      child: Text(
                        match.awayTeamName.isNotEmpty ? match.awayTeamName[0] : 'A',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: AppColors.secondary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      match.awayTeamName,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          if (match.isCompleted && match.score != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                match.score!.winnerTeamId != null
                    ? 'Winner: ${match.score!.winnerTeamId == match.homeTeam ? match.homeTeamName : match.awayTeamName}'
                    : 'Result: Draw',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.gold,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPinnedProductCard(PinnedProduct product) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.4), width: 1.2),
        gradient: LinearGradient(
          colors: [
            AppColors.surface,
            AppColors.gold.withValues(alpha: 0.04),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppColors.gold.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.shopping_bag_rounded,
              color: AppColors.gold,
              size: 28,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.gold,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        'MATCH MERCH',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textInverse,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  product.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                Text(
                  product.formattedPrice,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppColors.gold,
                  ),
                ),
              ],
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.gold,
              foregroundColor: AppColors.textInverse,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              minimumSize: const Size(80, 42),
            ),
            onPressed: () => _openQuickCheckoutModal(product),
            child: const Text(
              'Buy Now',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEventsTimelineSection() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.timeline_rounded, size: 20, color: AppColors.secondary),
                  SizedBox(width: 8),
                  Text(
                    'Event Timeline',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
              Text(
                '${_events.length} Events',
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_events.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No match events recorded yet.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _events.length,
              separatorBuilder: (_, __) => const Divider(color: AppColors.borderSubtle, height: 16),
              itemBuilder: (context, index) {
                final ev = _events[index];
                return _buildTimelineEventRow(ev);
              },
            ),
        ],
      ),
    );
  }

  Widget _buildTimelineEventRow(MatchEventModel ev) {
    final eventType = ev.payload['event_type'] ?? ev.type;
    final teamId = ev.payload['team_id'] ?? '';
    final isHomeTeam = _match != null && teamId == _match!.homeTeam;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: ev.compensated ? AppColors.error.withValues(alpha: 0.12) : AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: ev.compensated ? AppColors.error : AppColors.border,
              width: 1,
            ),
          ),
          child: Center(
            child: Text(
              '#${ev.sequence}',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: ev.compensated ? AppColors.error : AppColors.textSecondary,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    eventType.toString().toUpperCase(),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      decoration: ev.compensated ? TextDecoration.lineThrough : null,
                      color: ev.compensated ? AppColors.textSecondary : AppColors.textPrimary,
                    ),
                  ),
                  if (ev.compensated) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        'DISALLOWED / COMPENSATED',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: AppColors.error,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 2),
              Text(
                'Team: ${isHomeTeam ? _match!.homeTeamName : (_match != null ? _match!.awayTeamName : teamId)}',
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Quick Checkout Modal ───────────────────────────────────────────────────

  void _openQuickCheckoutModal(PinnedProduct product) {
    bool isSubmitting = false;
    String? statusMessage;
    OrderReceipt? completedReceipt;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Purchase Match Gear',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const Divider(color: AppColors.borderSubtle),
                  const SizedBox(height: 8),

                  if (completedReceipt == null) ...[
                    Row(
                      children: [
                        const Icon(Icons.check_circle_outline, color: AppColors.gold, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            product.name,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text(
                          product.formattedPrice,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.gold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Payment Method: NaSCon Mock Payment Gateway (tok_success)',
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 20),
                    if (statusMessage != null) ...[
                      Text(
                        statusMessage!,
                        style: const TextStyle(fontSize: 13, color: AppColors.error),
                      ),
                      const SizedBox(height: 12),
                    ],
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: AppColors.textInverse,
                        ),
                        onPressed: isSubmitting
                            ? null
                            : () async {
                                setModalState(() {
                                  isSubmitting = true;
                                  statusMessage = null;
                                });

                                try {
                                  final orderId = 'ord-${const Uuid().v4().substring(0, 8)}';
                                  final result = await _apiService.checkout(
                                    orderId: orderId,
                                    customerId: 'cust-demo-1',
                                    items: [
                                      {
                                        'variant_id': product.variantId ?? 'var-jersey-001-M',
                                        'quantity': 1,
                                      }
                                    ],
                                    paymentToken: 'tok_success',
                                  );

                                  setModalState(() {
                                    isSubmitting = false;
                                    completedReceipt = result.receipt;
                                  });
                                } catch (err) {
                                  setModalState(() {
                                    isSubmitting = false;
                                    statusMessage = 'Order failed: $err';
                                  });
                                }
                              },
                        child: isSubmitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.textInverse),
                              )
                            : const Text('Confirm Order (4500.00 PKR)'),
                      ),
                    ),
                  ] else ...[
                    // Order Success Receipt View
                    const Center(
                      child: Column(
                        children: [
                          Icon(Icons.verified_rounded, size: 54, color: AppColors.primary),
                          SizedBox(height: 10),
                          Text(
                            'Order Successful!',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.primary),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Verified Cryptographic Receipt Generated',
                            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Order ID: ${completedReceipt!.orderId}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                          const SizedBox(height: 4),
                          Text('Total: ${completedReceipt!.formattedTotal}', style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 4),
                          Text(
                            'HMAC Signature: ${completedReceipt!.signature.substring(0, 16)}...',
                            style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.textTertiary),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Close'),
                      ),
                    ),
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }
}
