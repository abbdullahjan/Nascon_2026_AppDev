/// An action queued while the mobile client was offline (Section 5.14 & 8.4).
class OfflineAction {
  final String actionId;
  final String type; // 'score_event' | 'roster_transfer'
  final String queuedAt;
  final int baseVersion;
  final Map<String, dynamic> payload;

  OfflineAction({
    required this.actionId,
    required this.type,
    required this.queuedAt,
    required this.baseVersion,
    required this.payload,
  });

  Map<String, dynamic> toJson() {
    return {
      'action_id': actionId,
      'type': type,
      'queued_at': queuedAt,
      'base_version': baseVersion,
      'payload': payload,
    };
  }

  factory OfflineAction.fromJson(Map<String, dynamic> json) {
    return OfflineAction(
      actionId: json['action_id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'score_event',
      queuedAt: json['queued_at']?.toString() ?? DateTime.now().toUtc().toIso8601String(),
      baseVersion: json['base_version'] is int ? json['base_version'] : int.tryParse(json['base_version']?.toString() ?? '1') ?? 1,
      payload: json['payload'] is Map ? Map<String, dynamic>.from(json['payload']) : {},
    );
  }
}

/// Result returned from the server for an individual offline action.
class SyncResultItem {
  final String actionId;
  final String status; // 'applied' | 'rejected' | 'duplicate'
  final String resolution; // 'appended' | 'rebased_append' | 'server_wins' | 'skipped_duplicate'
  final String? errorCode;
  final int processedOrder;
  final int? serverVersion;
  final String? signature;

  SyncResultItem({
    required this.actionId,
    required this.status,
    required this.resolution,
    this.errorCode,
    required this.processedOrder,
    this.serverVersion,
    this.signature,
  });

  bool get isSuccess => status == 'applied' || status == 'duplicate';

  factory SyncResultItem.fromJson(Map<String, dynamic> json) {
    return SyncResultItem(
      actionId: json['action_id']?.toString() ?? '',
      status: json['status']?.toString() ?? 'applied',
      resolution: json['resolution']?.toString() ?? 'appended',
      errorCode: json['error_code']?.toString(),
      processedOrder: json['processed_order'] is int ? json['processed_order'] : int.tryParse(json['processed_order']?.toString() ?? '0') ?? 0,
      serverVersion: json['server_version'] is int ? json['server_version'] : int.tryParse(json['server_version']?.toString() ?? ''),
      signature: json['signature']?.toString(),
    );
  }
}

/// Summary counts of sync operation.
class SyncSummary {
  final int applied;
  final int rejected;
  final int duplicate;

  SyncSummary({
    required this.applied,
    required this.rejected,
    required this.duplicate,
  });

  factory SyncSummary.fromJson(Map<String, dynamic> json) {
    return SyncSummary(
      applied: json['applied'] is int ? json['applied'] : int.tryParse(json['applied']?.toString() ?? '0') ?? 0,
      rejected: json['rejected'] is int ? json['rejected'] : int.tryParse(json['rejected']?.toString() ?? '0') ?? 0,
      duplicate: json['duplicate'] is int ? json['duplicate'] : int.tryParse(json['duplicate']?.toString() ?? '0') ?? 0,
    );
  }
}

/// Full sync response container.
class SyncResponse {
  final String deviceId;
  final List<SyncResultItem> results;
  final SyncSummary summary;

  SyncResponse({
    required this.deviceId,
    required this.results,
    required this.summary,
  });

  factory SyncResponse.fromJson(Map<String, dynamic> json) {
    List<SyncResultItem> resList = [];
    if (json['results'] is List) {
      resList = (json['results'] as List)
          .whereType<Map>()
          .map((item) => SyncResultItem.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }

    return SyncResponse(
      deviceId: json['device_id']?.toString() ?? '',
      results: resList,
      summary: json['summary'] is Map ? SyncSummary.fromJson(Map<String, dynamic>.from(json['summary'])) : SyncSummary(applied: 0, rejected: 0, duplicate: 0),
    );
  }
}
