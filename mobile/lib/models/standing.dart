/// Row representing one team in a league points table.
class StandingRow {
  final int rank;
  final String teamId;
  final String teamName;
  final int played;
  final int won;
  final int drawn;
  final int lost;
  final int points;
  final int goalsFor;
  final int goalsAgainst;
  final int goalDifference;
  final String qualificationStatus;

  StandingRow({
    required this.rank,
    required this.teamId,
    required this.teamName,
    required this.played,
    required this.won,
    required this.drawn,
    required this.lost,
    required this.points,
    this.goalsFor = 0,
    this.goalsAgainst = 0,
    this.goalDifference = 0,
    required this.qualificationStatus,
  });

  bool get isClinched => qualificationStatus == 'clinched';
  bool get isEliminated => qualificationStatus == 'eliminated';

  factory StandingRow.fromJson(Map<String, dynamic> json) {
    return StandingRow(
      rank: json['rank'] is int ? json['rank'] : int.tryParse(json['rank']?.toString() ?? '1') ?? 1,
      teamId: json['team_id']?.toString() ?? '',
      teamName: json['team_name']?.toString() ?? json['team_id']?.toString() ?? 'Team',
      played: json['played'] is int ? json['played'] : int.tryParse(json['played']?.toString() ?? '0') ?? 0,
      won: json['won'] is int ? json['won'] : int.tryParse(json['won']?.toString() ?? '0') ?? 0,
      drawn: json['drawn'] is int ? json['drawn'] : int.tryParse(json['drawn']?.toString() ?? '0') ?? 0,
      lost: json['lost'] is int ? json['lost'] : int.tryParse(json['lost']?.toString() ?? '0') ?? 0,
      points: json['points'] is int ? json['points'] : int.tryParse(json['points']?.toString() ?? '0') ?? 0,
      goalsFor: json['scored'] is int ? json['scored'] : (json['goals_for'] is int ? json['goals_for'] : int.tryParse(json['scored']?.toString() ?? json['goals_for']?.toString() ?? '0') ?? 0),
      goalsAgainst: json['conceded'] is int ? json['conceded'] : (json['goals_against'] is int ? json['goals_against'] : int.tryParse(json['conceded']?.toString() ?? json['goals_against']?.toString() ?? '0') ?? 0),
      goalDifference: json['diff'] is int ? json['diff'] : (json['goal_difference'] is int ? json['goal_difference'] : int.tryParse(json['diff']?.toString() ?? json['goal_difference']?.toString() ?? '0') ?? 0),
      qualificationStatus: json['status']?.toString() ?? json['qualification_status']?.toString() ?? 'still_possible',
    );
  }
}

/// Standings container for a league.
class LeagueStandings {
  final String leagueId;
  final String sportId;
  final int qualificationSpots;
  final List<StandingRow> standings;

  LeagueStandings({
    required this.leagueId,
    required this.sportId,
    this.qualificationSpots = 1,
    required this.standings,
  });

  factory LeagueStandings.fromJson(Map<String, dynamic> json) {
    List<StandingRow> rows = [];
    final list = json['table'] is List ? json['table'] : (json['standings'] is List ? json['standings'] : []);
    if (list is List) {
      rows = list
          .whereType<Map>()
          .map((item) => StandingRow.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }

    return LeagueStandings(
      leagueId: json['league_id']?.toString() ?? '',
      sportId: json['sport_id']?.toString() ?? 'football',
      qualificationSpots: json['qualification_spots'] is int ? json['qualification_spots'] : int.tryParse(json['qualification_spots']?.toString() ?? '1') ?? 1,
      standings: rows,
    );
  }
}
