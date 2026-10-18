import 'dart:convert';

/// Metadata for a club (branding, venue, colors).
class ClubMeta {
  final String venue;
  final String city;
  final String primaryColor;
  final String secondaryColor;
  final String logoUrl;

  ClubMeta({
    required this.venue,
    required this.city,
    required this.primaryColor,
    required this.secondaryColor,
    required this.logoUrl,
  });

  factory ClubMeta.fromJson(Map<String, dynamic> json) {
    return ClubMeta(
      venue: json['venue']?.toString() ?? 'National Stadium',
      city: json['city']?.toString() ?? 'Islamabad',
      primaryColor: json['primary_color']?.toString() ?? '#1565C0',
      secondaryColor: json['secondary_color']?.toString() ?? '#FFB300',
      logoUrl: json['logo_url']?.toString() ?? '',
    );
  }
}

/// Player registration entry in a club/squad.
class PlayerRegistration {
  final String playerId;
  final String name;
  final String? squadId;
  final String? position;
  final String? role;
  final String? registrationType; // permanent, loan
  final String? loanEndDate;

  PlayerRegistration({
    required this.playerId,
    required this.name,
    this.squadId,
    this.position,
    this.role,
    this.registrationType,
    this.loanEndDate,
  });

  factory PlayerRegistration.fromJson(Map<String, dynamic> json) {
    return PlayerRegistration(
      playerId: json['player_id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Player',
      squadId: json['squad_id']?.toString(),
      position: json['position']?.toString() ?? 'Player',
      role: json['role']?.toString() ?? 'Starter',
      registrationType: json['registration_type']?.toString() ?? 'permanent',
      loanEndDate: json['loan_end_date']?.toString(),
    );
  }
}

/// Model representing a Sports Club.
class ClubModel {
  final String clubId;
  final String tenantId;
  final String name;
  final ClubMeta meta;
  final int squadsCount;
  final int playersCount;
  final List<PlayerRegistration> roster;
  final String? createdAt;

  ClubModel({
    required this.clubId,
    required this.tenantId,
    required this.name,
    required this.meta,
    this.squadsCount = 0,
    this.playersCount = 0,
    this.roster = const [],
    this.createdAt,
  });

  factory ClubModel.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> metaMap = {};
    if (json['meta'] is Map) {
      metaMap = Map<String, dynamic>.from(json['meta']);
    } else if (json['meta'] is String) {
      try {
        metaMap = jsonDecode(json['meta']);
      } catch (_) {}
    }

    List<PlayerRegistration> rList = [];
    if (json['players'] is List) {
      rList = (json['players'] as List)
          .whereType<Map>()
          .map((item) => PlayerRegistration.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    } else if (json['roster'] is List) {
      rList = (json['roster'] as List)
          .whereType<Map>()
          .map((item) => PlayerRegistration.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }

    return ClubModel(
      clubId: json['club_id']?.toString() ?? '',
      tenantId: json['tenant_id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Club',
      meta: ClubMeta.fromJson(metaMap),
      squadsCount: json['squads_count'] is int ? json['squads_count'] : int.tryParse(json['squads_count']?.toString() ?? '0') ?? 0,
      playersCount: json['players_count'] is int ? json['players_count'] : int.tryParse(json['players_count']?.toString() ?? '0') ?? rList.length,
      roster: rList,
      createdAt: json['created_at']?.toString(),
    );
  }
}
