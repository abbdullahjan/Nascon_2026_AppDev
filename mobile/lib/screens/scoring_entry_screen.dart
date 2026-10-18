import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../models/match.dart';
import '../services/api_service.dart';
import '../theme.dart';
import '../widgets/sync_bar.dart';

/// Screen 7: Scoring Entry Screen (For League Organizer)
/// Allows recording live score events and compensating rollback events.
/// Seamlessly queues actions when offline for Section 8.4 Desk Check.
class ScoringEntryScreen extends StatefulWidget {
  const ScoringEntryScreen({super.key});

  @override
  State<ScoringEntryScreen> createState() => _ScoringEntryScreenState();
}

class _ScoringEntryScreenState extends State<ScoringEntryScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  List<MatchModel> _matches = [];
  MatchModel? _selectedMatch;
  List<MatchEventModel> _events = [];

  String _selectedTeam = 'home'; // 'home' | 'away'
  String _eventType = 'goal';
  bool _isSubmitting = false;
  String? _statusBanner;
  bool _isSuccessBanner = true;

  @override
  void initState() {
    super.initState();
    _loadMatches();
  }

  Future<void> _loadMatches() async {
    setState(() {
      _isLoading = true;
      _statusBanner = null;
    });

    try {
      final matches = await _apiService.getMatches();
      if (!mounted) return;
      setState(() {
        _matches = matches;
        if (_matches.isNotEmpty) {
          _selectedMatch = _matches.firstWhere(
            (m) => m.isLive,
            orElse: () => _matches.first,
          );
        }
        _isLoading = false;
      });

      if (_selectedMatch != null) {
        _loadEventsForSelectedMatch();
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadEventsForSelectedMatch() async {
    if (_selectedMatch == null) return;
    try {
      final evList = await _apiService.getMatchEvents(_selectedMatch!.matchId);
      final refreshedMatch = await _apiService.getMatchDetail(_selectedMatch!.matchId);
      if (!mounted) return;
      setState(() {
        _events = evList;
        if (refreshedMatch != null) _selectedMatch = refreshedMatch;
      });
    } catch (_) {}
  }

  Future<void> _recordScoreEvent() async {
    if (_selectedMatch == null) return;

    setState(() {
      _isSubmitting = true;
      _statusBanner = null;
    });

    final teamId = _selectedTeam == 'home' ? _selectedMatch!.homeTeam : _selectedMatch!.awayTeam;
    final eventId = 'evt-${const Uuid().v4().substring(0, 8)}';

    final payload = {
      'event_id': eventId,
      'match_id': _selectedMatch!.matchId,
      'type': 'score',
      'payload': {
        'team_id': teamId,
        'event_type': _eventType,
      },
    };

    final result = await _apiService.postScoreEvent(
      matchId: _selectedMatch!.matchId,
      type: 'score',
      payload: payload,
    );

    if (!mounted) return;

    setState(() {
      _isSubmitting = false;
      if (result['queued_offline'] == true) {
        _statusBanner = 'Offline: Score event queued for sync.';
        _isSuccessBanner = true;
      } else if (result['success'] == true) {
        _statusBanner = 'Score event recorded successfully!';
        _isSuccessBanner = true;
      } else {
        _statusBanner = result['error']?.toString() ?? 'Failed to record event';
        _isSuccessBanner = false;
      }
    });

    _loadEventsForSelectedMatch();
  }

  Future<void> _compensateEvent(MatchEventModel ev) async {
    if (_selectedMatch == null) return;

    setState(() {
      _isSubmitting = true;
      _statusBanner = null;
    });

    final compEventId = 'comp-${const Uuid().v4().substring(0, 8)}';
    final payload = {
      'event_id': compEventId,
      'match_id': _selectedMatch!.matchId,
      'type': 'compensation',
      'target_event_id': ev.eventId,
      'payload': {
        'reason': 'VAR Overturn / Disallowed',
        'target_event_id': ev.eventId,
      },
    };

    final result = await _apiService.postScoreEvent(
      matchId: _selectedMatch!.matchId,
      type: 'compensation',
      payload: payload,
      targetEventId: ev.eventId,
    );

    if (!mounted) return;

    setState(() {
      _isSubmitting = false;
      if (result['queued_offline'] == true) {
        _statusBanner = 'Offline: Compensation event queued for sync.';
        _isSuccessBanner = true;
      } else if (result['success'] == true) {
        _statusBanner = 'Event #${ev.sequence} successfully compensated (rolled back).';
        _isSuccessBanner = true;
      } else {
        _statusBanner = result['error']?.toString() ?? 'Compensation failed';
        _isSuccessBanner = false;
      }
    });

    _loadEventsForSelectedMatch();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SyncBar(),
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildMatchSelector(),
                    const SizedBox(height: 16),
                    if (_statusBanner != null) ...[
                      _buildStatusBanner(),
                      const SizedBox(height: 16),
                    ],
                    if (_selectedMatch != null) ...[
                      _buildCurrentScorecard(),
                      const SizedBox(height: 16),
                      _buildScoringEntryCard(),
                      const SizedBox(height: 16),
                      _buildRollbackCard(),
                    ],
                  ],
                ),
        ),
      ],
    );
  }

  Widget _buildStatusBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: _isSuccessBanner ? AppColors.primary.withValues(alpha: 0.12) : AppColors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: _isSuccessBanner ? AppColors.primary : AppColors.error,
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Icon(
            _isSuccessBanner ? Icons.check_circle_rounded : Icons.error_outline_rounded,
            color: _isSuccessBanner ? AppColors.primary : AppColors.error,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _statusBanner!,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: _isSuccessBanner ? AppColors.primary : AppColors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMatchSelector() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'SELECT ACTIVE MATCH',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _selectedMatch?.matchId,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.sports_soccer_rounded),
            ),
            items: _matches.map((m) {
              return DropdownMenuItem(
                value: m.matchId,
                child: Text('${m.homeTeamName} vs ${m.awayTeamName} (${m.status.toUpperCase()})'),
              );
            }).toList(),
            onChanged: (val) {
              if (val != null) {
                setState(() {
                  _selectedMatch = _matches.firstWhere((m) => m.matchId == val);
                });
                _loadEventsForSelectedMatch();
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentScorecard() {
    final m = _selectedMatch!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          Column(
            children: [
              Text(m.homeTeamName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 4),
              Text(
                '${m.score?.homeScore ?? 0}',
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: AppColors.primary),
              ),
            ],
          ),
          const Text('VS', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.textTertiary)),
          Column(
            children: [
              Text(m.awayTeamName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 4),
              Text(
                '${m.score?.awayScore ?? 0}',
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: AppColors.secondary),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildScoringEntryCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.add_circle_outline_rounded, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text('Log Score Event', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 14),

          // Team Selector
          const Text('SCORING TEAM', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: ChoiceChip(
                  selected: _selectedTeam == 'home',
                  onSelected: (_) => setState(() => _selectedTeam = 'home'),
                  label: Text(_selectedMatch!.homeTeamName),
                  selectedColor: AppColors.primary,
                  backgroundColor: AppColors.surfaceElevated,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  selected: _selectedTeam == 'away',
                  onSelected: (_) => setState(() => _selectedTeam = 'away'),
                  label: Text(_selectedMatch!.awayTeamName),
                  selectedColor: AppColors.secondary,
                  backgroundColor: AppColors.surfaceElevated,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Event Type
          const Text('EVENT TYPE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: ['goal', 'points', 'penalty', 'two_pointer', 'three_pointer'].map((t) {
              final isSel = _eventType == t;
              return ChoiceChip(
                selected: isSel,
                onSelected: (_) => setState(() => _eventType = t),
                label: Text(t.toUpperCase()),
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.surfaceElevated,
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.scoreboard_rounded, size: 18),
              label: Text(_isSubmitting ? 'Recording...' : 'Record Event'),
              onPressed: _isSubmitting ? null : _recordScoreEvent,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRollbackCard() {
    final activeEvents = _events.where((e) => !e.compensated).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.undo_rounded, color: AppColors.warning, size: 20),
              SizedBox(width: 8),
              Text('Compensate / Disallow Event', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Appends a compensating rollback event signed with DAY1_SALT (Section 6 & 8.4).',
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),
          if (activeEvents.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('No active score events to compensate.', style: TextStyle(color: AppColors.textTertiary, fontSize: 13)),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: activeEvents.length,
              separatorBuilder: (_, __) => const Divider(color: AppColors.borderSubtle, height: 12),
              itemBuilder: (context, index) {
                final ev = activeEvents[index];
                return Row(
                  children: [
                    Text('#${ev.sequence}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.primary)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${ev.payload['event_type'] ?? ev.type} (${ev.eventId})',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error,
                        side: const BorderSide(color: AppColors.error),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      ),
                      onPressed: _isSubmitting ? null : () => _compensateEvent(ev),
                      child: const Text('Disallow'),
                    ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}
