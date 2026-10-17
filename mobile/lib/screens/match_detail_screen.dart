import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';

class MatchDetailScreen extends StatefulWidget {
  const MatchDetailScreen({super.key, required this.matchId, required this.fixture});
  final String matchId;
  final Map<String, dynamic> fixture;
  @override
  State<MatchDetailScreen> createState() => _MatchDetailScreenState();
}

class _MatchDetailScreenState extends State<MatchDetailScreen> {
  Map<String, dynamic>? _score;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadScore();
  }

  Future<void> _loadScore() async {
    final state = AppStateScope.of(context);
    setState(() { _loading = true; _error = null; });
    if (state.online) {
      try {
        final data = await ApiClient().getScore(widget.matchId);
        await state.cacheData('score_${widget.matchId}', data);
        setState(() { _score = data; _loading = false; });
      } catch (e) {
        _loadCached(state);
        setState(() => _loading = false);
      }
    } else {
      _loadCached(state);
      setState(() => _loading = false);
    }
  }

  void _loadCached(AppState state) {
    final cached = state.getCached('score_${widget.matchId}');
    if (cached != null) {
      _score = Map<String, dynamic>.from(cached['data'] as Map? ?? {});
    }
  }

  String _outcomeLabel(String? outcome) {
    switch (outcome) {
      case 'home_win': return 'Home Win';
      case 'away_win': return 'Away Win';
      case 'draw': return 'Draw';
      case 'undecided': return 'Undecided';
      default: return '—';
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    final fixture = widget.fixture;
    final score = _score;
    final status = score?['status'] as String? ?? fixture['status'] as String? ?? 'upcoming';
    final isLive = status == 'in_progress';
    final isOrganizer = state.isOrganizer;

    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        title: const Text('Match Centre'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _loadScore),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kGold))
          : RefreshIndicator(
              color: kGold, backgroundColor: kSurface,
              onRefresh: _loadScore,
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 80), children: [
                if (!state.online) OfflineBanner(),

                // Score header
                GoldBanner(height: 180, child: Column(children: [
                  Row(children: [
                    Eyebrow(fixture['sport'] as String? ?? 'sport'),
                    const Spacer(),
                    if (isLive) ...[const LiveDot(), const SizedBox(width: 6)],
                    StatusBadge(matchStatusLabel(status), color: matchStatusColor(status)),
                  ]),
                  const Spacer(),
                  Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                    Expanded(child: Column(children: [
                      TeamAvatar(fixture['home'] as String? ?? '?', size: 52),
                      const SizedBox(height: 8),
                      Text(fixture['home'] as String? ?? '',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                    ])),
                    Column(children: [
                      Text(
                        score != null
                            ? '${(score['home'] as Map?)?['score'] ?? 0}  —  ${(score['away'] as Map?)?['score'] ?? 0}'
                            : '—',
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: kText),
                      ),
                      if (status == 'completed')
                        Text(_outcomeLabel(score?['outcome'] as String?),
                            style: const TextStyle(color: kGold, fontSize: 11, fontWeight: FontWeight.w700)),
                    ]),
                    Expanded(child: Column(children: [
                      TeamAvatar(fixture['away'] as String? ?? '?', size: 52, color: Colors.lightBlueAccent),
                      const SizedBox(height: 8),
                      Text(fixture['away'] as String? ?? '',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                    ])),
                  ]),
                  const Spacer(),
                ])),

                const SizedBox(height: 16),

                // Organizer controls
                if (isOrganizer) ...[
                  const SectionTitle('Match Controls'),
                  const SizedBox(height: 10),
                  _OrganizerControls(
                    matchId: widget.matchId,
                    status: status,
                    fixture: fixture,
                    score: score,
                    sports: state.sports,
                    onRefresh: _loadScore,
                  ),
                  const SizedBox(height: 16),
                ],

                // Innings details (cricket)
                if (score != null && (score['home'] as Map?)?['wickets'] != null) ...[
                  Panel(child: Column(children: [
                    const SectionTitle('Innings'),
                    const SizedBox(height: 10),
                    _inningsRow('Home', score['home'] as Map),
                    const Divider(color: kBorder, height: 16),
                    _inningsRow('Away', score['away'] as Map),
                  ])),
                  const SizedBox(height: 16),
                ],

                // Event timeline
                const SectionTitle('Event Timeline'),
                const SizedBox(height: 10),
                if (score == null || (score['events'] as List?)?.isEmpty == true)
                  const Panel(child: EmptyState(icon: Icons.timeline_rounded, title: 'No events yet',
                      subtitle: 'Score events will appear here once the match starts.'))
                else
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: ((score!['events'] as List?) ?? []).asMap().entries.map((e) {
                        final ev = e.value as Map<String, dynamic>;
                        final compensated = ev['compensated'] == true;
                        return _EventRow(event: ev, compensated: compensated,
                            isLast: e.key == (score['events'] as List).length - 1);
                      }).toList(),
                    ),
                  ),

                const SizedBox(height: 16),
                // Pinned product
                const SectionTitle('Pinned Merchandise'),
                const SizedBox(height: 10),
                Panel(child: Row(children: [
                  Container(width: 48, height: 48,
                    decoration: BoxDecoration(color: kGold.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.checkroom_rounded, color: kGold)),
                  const SizedBox(width: 12),
                  const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Alpha Matchday Jersey', style: TextStyle(fontWeight: FontWeight.w700)),
                    Text('PKR 4,500.00 · M / L', style: TextStyle(color: kMuted, fontSize: 11)),
                  ])),
                  const Icon(Icons.push_pin_outlined, color: kGold, size: 18),
                ])),
              ]),
            ),
    );
  }

  Widget _inningsRow(String label, Map data) => Row(children: [
    Text(label, style: const TextStyle(color: kMuted, fontSize: 12, fontWeight: FontWeight.w600)),
    const Spacer(),
    Text('${data['score']}/${data['wickets']}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
    const SizedBox(width: 8),
    Text('(${data['overs']} ov)', style: const TextStyle(color: kMuted, fontSize: 12)),
  ]);
}

// ── Event row in timeline ─────────────────────────────────────────────────
class _EventRow extends StatelessWidget {
  const _EventRow({required this.event, required this.compensated, required this.isLast});
  final Map<String, dynamic> event;
  final bool compensated;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final type = event['type'] as String? ?? '';
    final payload = event['payload'] as Map<String, dynamic>? ?? {};
    final seq = event['sequence'] as int? ?? 0;
    final isCompensation = type == 'compensation';

    Color accentColor = kGold;
    IconData icon = Icons.fiber_manual_record_rounded;
    if (type == 'score') { accentColor = kGreen; icon = Icons.add_circle_outline_rounded; }
    if (type == 'match_start') { accentColor = kBlue; icon = Icons.play_circle_outline_rounded; }
    if (type == 'match_end') { accentColor = kMuted; icon = Icons.stop_circle_outlined; }
    if (compensated || isCompensation) accentColor = kRed;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        border: isLast ? null : const Border(bottom: BorderSide(color: kBorder)),
      ),
      child: Row(children: [
        Container(
          width: 26, height: 26,
          decoration: BoxDecoration(
            color: accentColor.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Center(child: Text('$seq', style: TextStyle(color: accentColor, fontSize: 9, fontWeight: FontWeight.w900))),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            isCompensation ? 'CORRECTION' : type.toUpperCase().replaceAll('_', ' '),
            style: TextStyle(
              color: compensated ? kRed : (isCompensation ? kRed : accentColor),
              fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.8,
              decoration: compensated ? TextDecoration.lineThrough : null,
            ),
          ),
          if (payload.isNotEmpty)
            Text(
              payload.entries.map((e) => '${e.key}: ${e.value}').join(' · '),
              style: TextStyle(
                color: kMuted, fontSize: 11,
                decoration: compensated ? TextDecoration.lineThrough : null,
              ),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
        ])),
        if (compensated)
          const StatusBadge('OVERTURNED', color: kRed),
      ]),
    );
  }
}

// ── Organizer controls ────────────────────────────────────────────────────
class _OrganizerControls extends StatefulWidget {
  const _OrganizerControls({required this.matchId, required this.status, required this.fixture, required this.score, required this.sports, required this.onRefresh});
  final String matchId, status;
  final Map<String, dynamic> fixture;
  final Map<String, dynamic>? score;
  final List<Map<String, dynamic>> sports;
  final VoidCallback onRefresh;
  @override
  State<_OrganizerControls> createState() => _OrganizerControlsState();
}

class _OrganizerControlsState extends State<_OrganizerControls> {
  bool _busy = false;
  String? _selectedTeam;
  String? _selectedEvent;

  Future<void> _sendEvent(AppState state, String type, {Map<String, dynamic>? payload}) async {
    setState(() => _busy = true);
    try {
      final eventId = 'evt_${DateTime.now().microsecondsSinceEpoch}';
      await ApiClient().postEvent({'event_id': eventId, 'match_id': widget.matchId, 'type': type, 'payload': payload ?? {}});
      widget.onRefresh();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$type applied ✓')));
    } catch (e) {
      if (!mounted) return;
      final msg = ApiClient.errorMessage(e);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: kRed));
    }
    setState(() => _busy = false);
  }

  Future<void> _queueOffline(AppState state) async {
    if (_selectedTeam == null || _selectedEvent == null) return;
    final version = (widget.score?['version'] as int?) ?? 0;
    await state.queueScoreEvent(
      matchId: widget.matchId, teamId: _selectedTeam!,
      eventType: _selectedEvent!, baseVersion: version,
    );
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Score queued for sync ✓')));
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    final sportId = widget.score?['sport_id'] as String? ?? widget.fixture['sport'] as String? ?? 'football';
    
    // Get event types from sport config
    final sportConfig = widget.sports.firstWhere(
      (s) => s['sport_id'] == sportId,
      orElse: () => <String, dynamic>{'scoring_events': <String, dynamic>{}},
    );
    final scoringEvents = sportConfig['scoring_events'] as Map<String, dynamic>? ?? {};
    final events = scoringEvents.keys.toList();
    
    final homeTeam = widget.fixture['home'] as String? ?? 'home';
    final awayTeam = widget.fixture['away'] as String? ?? 'away';

    return Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Eyebrow('Organizer controls', color: kGold),
      const SizedBox(height: 12),
      if (widget.status == 'upcoming') ...[
        GhostButton(label: 'Start Match', icon: Icons.play_arrow_rounded,
            onPressed: _busy ? null : () => _sendEvent(state, 'match_start')),
      ] else if (widget.status == 'in_progress') ...[
        // Team selector
        Row(children: [homeTeam, awayTeam].map((t) => Expanded(child: Padding(
          padding: EdgeInsets.only(right: t == homeTeam ? 6 : 0),
          child: GestureDetector(
            onTap: () => setState(() => _selectedTeam = t),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: _selectedTeam == t ? kGold.withValues(alpha: 0.15) : kSurface2,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: _selectedTeam == t ? kGold.withValues(alpha: 0.5) : kBorder),
              ),
              child: Text(t, textAlign: TextAlign.center,
                  style: TextStyle(color: _selectedTeam == t ? kGold : kMuted,
                      fontWeight: FontWeight.w700, fontSize: 12)),
            ),
          ),
        ))).toList()),
        const SizedBox(height: 10),
        // Event type dropdown
        DropdownButtonFormField<String>(
          value: _selectedEvent,
          dropdownColor: kSurface2,
          decoration: const InputDecoration(hintText: 'Select event type', prefixIcon: Icon(Icons.sports_rounded)),
          items: events.map((e) => DropdownMenuItem(value: e,
              child: Text(e.replaceAll('_', ' ').toUpperCase(),
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)))).toList(),
          onChanged: (v) => setState(() => _selectedEvent = v),
        ),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: GhostButton(
            label: state.online ? 'Record Event' : 'Queue Offline',
            icon: state.online ? Icons.add_rounded : Icons.offline_pin_rounded,
            onPressed: _busy ? null : () {
              if (_selectedTeam == null || _selectedEvent == null) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select team and event first')));
                return;
              }
              if (state.online) {
                _sendEvent(state, 'score', payload: {'team_id': _selectedTeam!, 'event_type': _selectedEvent!});
              } else {
                _queueOffline(state);
              }
            },
          )),
          const SizedBox(width: 10),
          Expanded(child: GhostButton(label: 'End Match', icon: Icons.stop_circle_outlined,
              onPressed: _busy ? null : () => _sendEvent(state, 'match_end'))),
        ]),
      ] else if (widget.status == 'completed') ...[
        const Text('Match completed. You can still add compensation events.',
            style: TextStyle(color: kMuted, fontSize: 12)),
      ],
    ]));
  }
}
