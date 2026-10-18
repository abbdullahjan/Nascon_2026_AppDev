import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../models/sync_action.dart';

/// Service managing the persistent offline action queue (Section 5.14 & 8.4).
/// Survives app restarts and airplane mode.
class OfflineQueueService {
  static final OfflineQueueService _instance = OfflineQueueService._internal();
  factory OfflineQueueService() => _instance;
  OfflineQueueService._internal();

  static const String _keyQueue = 'offline_action_queue';
  static const String _keyDeviceId = 'device_client_id';

  final ValueNotifier<int> queueCountNotifier = ValueNotifier<int>(0);
  final ValueNotifier<bool> isSyncingNotifier = ValueNotifier<bool>(false);

  /// Get or create a persistent device identifier.
  Future<String> getDeviceId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      var id = prefs.getString(_keyDeviceId);
      if (id == null || id.isEmpty) {
        id = 'dev-${const Uuid().v4().substring(0, 8)}';
        await prefs.setString(_keyDeviceId, id);
      }
      return id;
    } catch (_) {
      return 'dev-client-1';
    }
  }

  /// Retrieve all pending actions from persistent storage.
  Future<List<OfflineAction>> getQueue() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final list = prefs.getStringList(_keyQueue) ?? [];
      final actions = list.map((item) {
        try {
          return OfflineAction.fromJson(jsonDecode(item));
        } catch (_) {
          return null;
        }
      }).whereType<OfflineAction>().toList();

      queueCountNotifier.value = actions.length;
      return actions;
    } catch (_) {
      return [];
    }
  }

  /// Add a new action to the offline queue.
  Future<OfflineAction> enqueue({
    required String type, // 'score_event' | 'roster_transfer'
    required int baseVersion,
    required Map<String, dynamic> payload,
  }) async {
    final action = OfflineAction(
      actionId: 'act-${const Uuid().v4().substring(0, 8)}',
      type: type,
      queuedAt: DateTime.now().toUtc().toIso8601String(),
      baseVersion: baseVersion,
      payload: payload,
    );

    try {
      final prefs = await SharedPreferences.getInstance();
      final currentList = prefs.getStringList(_keyQueue) ?? [];
      currentList.add(jsonEncode(action.toJson()));
      await prefs.setStringList(_keyQueue, currentList);
      queueCountNotifier.value = currentList.length;
    } catch (e) {
      debugPrint('Error enqueuing action: $e');
    }

    return action;
  }

  /// Remove an action by its ID.
  Future<void> removeAction(String actionId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final currentList = prefs.getStringList(_keyQueue) ?? [];
      currentList.removeWhere((item) {
        try {
          final parsed = jsonDecode(item);
          return parsed['action_id'] == actionId;
        } catch (_) {
          return false;
        }
      });
      await prefs.setStringList(_keyQueue, currentList);
      queueCountNotifier.value = currentList.length;
    } catch (_) {}
  }

  /// Clear the entire offline queue.
  Future<void> clearQueue() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_keyQueue);
      queueCountNotifier.value = 0;
    } catch (_) {}
  }
}
