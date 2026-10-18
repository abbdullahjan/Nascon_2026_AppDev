/// Model representing a League / Tournament.
class LeagueModel {
  final String leagueId;
  final String tenantId;
  final String sportId;
  final List<String> teams;
  final Map<String, dynamic> points;
  final int fixturesCount;
  final String? createdAt;

  LeagueModel({
    required this.leagueId,
    required this.tenantId,
    required this.sportId,
    required this.teams,
    required this.points,
    this.fixturesCount = 0,
    this.createdAt,
  });

  String get displayName => leagueId.replaceAll('-', ' ').toUpperCase();

  factory LeagueModel.fromJson(Map<String, dynamic> json) {
    List<String> tList = [];
    if (json['teams'] is List) {
      tList = (json['teams'] as List).map((e) => e.toString()).toList();
    }

    Map<String, dynamic> pts = {'win': 3, 'draw': 1, 'loss': 0};
    if (json['points'] is Map) {
      pts = Map<String, dynamic>.from(json['points']);
    }

    return LeagueModel(
      leagueId: json['league_id']?.toString() ?? '',
      tenantId: json['tenant_id']?.toString() ?? '',
      sportId: json['sport_id']?.toString() ?? 'football',
      teams: tList,
      points: pts,
      fixturesCount: json['fixtures_count'] is int ? json['fixtures_count'] : int.tryParse(json['fixtures_count']?.toString() ?? '0') ?? 0,
      createdAt: json['created_at']?.toString(),
    );
  }
}
