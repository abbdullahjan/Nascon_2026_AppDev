import 'dart:convert';

/// Pinned merchandise product for a match.
class PinnedProduct {
  final String productId;
  final String name;
  final int priceMinor;
  final String currency;
  final String? variantId;

  PinnedProduct({
    required this.productId,
    required this.name,
    required this.priceMinor,
    required this.currency,
    this.variantId,
  });

  String get formattedPrice => '${(priceMinor / 100).toStringAsFixed(2)} $currency';

  factory PinnedProduct.fromJson(Map<String, dynamic> json) {
    return PinnedProduct(
      productId: json['product_id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Official Merchandise',
      priceMinor: json['price_minor'] is int ? json['price_minor'] : int.tryParse(json['price_minor']?.toString() ?? '0') ?? 0,
      currency: json['currency']?.toString() ?? 'PKR',
      variantId: json['variant_id']?.toString(),
    );
  }
}

/// Score information summary.
class MatchScore {
  final int homeScore;
  final int awayScore;
  final int? homeWickets;
  final int? awayWickets;
  final double? homeOvers;
  final double? awayOvers;
  final String outcome;
  final String? winnerTeamId;

  MatchScore({
    required this.homeScore,
    required this.awayScore,
    this.homeWickets,
    this.awayWickets,
    this.homeOvers,
    this.awayOvers,
    required this.outcome,
    this.winnerTeamId,
  });

  factory MatchScore.fromJson(Map<String, dynamic> json) {
    return MatchScore(
      homeScore: json['home_score'] is int ? json['home_score'] : int.tryParse(json['home_score']?.toString() ?? '0') ?? 0,
      awayScore: json['away_score'] is int ? json['away_score'] : int.tryParse(json['away_score']?.toString() ?? '0') ?? 0,
      homeWickets: json['home_wickets'] is int ? json['home_wickets'] : int.tryParse(json['home_wickets']?.toString() ?? ''),
      awayWickets: json['away_wickets'] is int ? json['away_wickets'] : int.tryParse(json['away_wickets']?.toString() ?? ''),
      homeOvers: json['home_overs'] is num ? (json['home_overs'] as num).toDouble() : double.tryParse(json['home_overs']?.toString() ?? ''),
      awayOvers: json['away_overs'] is num ? (json['away_overs'] as num).toDouble() : double.tryParse(json['away_overs']?.toString() ?? ''),
      outcome: json['outcome']?.toString() ?? 'pending',
      winnerTeamId: json['winner_team_id']?.toString(),
    );
  }
}

/// Model representing a match fixture.
class MatchModel {
  final String matchId;
  final String leagueId;
  final String sportId;
  final String homeTeam;
  final String awayTeam;
  final String homeTeamName;
  final String awayTeamName;
  final String status;
  final MatchScore? score;
  final PinnedProduct? pinnedProduct;
  final String? createdAt;

  MatchModel({
    required this.matchId,
    required this.leagueId,
    required this.sportId,
    required this.homeTeam,
    required this.awayTeam,
    required this.homeTeamName,
    required this.awayTeamName,
    required this.status,
    this.score,
    this.pinnedProduct,
    this.createdAt,
  });

  bool get isLive => status == 'in_progress';
  bool get isCompleted => status == 'completed';
  bool get isScheduled => status == 'scheduled' || status == 'pending';

  factory MatchModel.fromJson(Map<String, dynamic> json) {
    return MatchModel(
      matchId: json['match_id']?.toString() ?? '',
      leagueId: json['league_id']?.toString() ?? '',
      sportId: json['sport_id']?.toString() ?? 'football',
      homeTeam: json['home_team']?.toString() ?? '',
      awayTeam: json['away_team']?.toString() ?? '',
      homeTeamName: json['home_team_name']?.toString() ?? json['home_team']?.toString() ?? 'Home Team',
      awayTeamName: json['away_team_name']?.toString() ?? json['away_team']?.toString() ?? 'Away Team',
      status: json['status']?.toString() ?? 'scheduled',
      score: json['score'] is Map ? MatchScore.fromJson(Map<String, dynamic>.from(json['score'])) : null,
      pinnedProduct: json['pinned_product'] is Map ? PinnedProduct.fromJson(Map<String, dynamic>.from(json['pinned_product'])) : null,
      createdAt: json['created_at']?.toString(),
    );
  }
}

/// An individual timeline event inside a match.
class MatchEventModel {
  final int sequence;
  final String eventId;
  final String type;
  final Map<String, dynamic> payload;
  final String? signature;
  final bool compensated;
  final String? compensatedBy;
  final String? createdAt;

  MatchEventModel({
    required this.sequence,
    required this.eventId,
    required this.type,
    required this.payload,
    this.signature,
    this.compensated = false,
    this.compensatedBy,
    this.createdAt,
  });

  factory MatchEventModel.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> p = {};
    if (json['payload'] is Map) {
      p = Map<String, dynamic>.from(json['payload']);
    } else if (json['payload'] is String) {
      try {
        p = jsonDecode(json['payload']);
      } catch (_) {}
    }

    return MatchEventModel(
      sequence: json['sequence'] is int ? json['sequence'] : int.tryParse(json['sequence']?.toString() ?? '0') ?? 0,
      eventId: json['event_id']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      payload: p,
      signature: json['signature']?.toString(),
      compensated: json['compensated'] == true,
      compensatedBy: json['compensated_by']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }
}
