import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  String baseUrl = 'http://10.0.2.2:8080';
  Duration timeout = const Duration(seconds: 4);

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<bool> health() async {
    try {
      final response = await http.get(_uri('/health')).timeout(timeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>?> get(String path) async {
    final response = await http.get(_uri(path)).timeout(timeout);
    final body = _decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, body);
    }
    return body;
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> data) async {
    final response = await http.post(
      _uri(path),
      headers: {'Content-Type': 'application/json; charset=utf-8'},
      body: jsonEncode(data),
    ).timeout(const Duration(seconds: 8));
    final body = _decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(response.statusCode, body);
    }
    return body;
  }

  Map<String, dynamic> _decode(String body) {
    if (body.isEmpty) return {};
    final decoded = jsonDecode(body);
    return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.body);
  final int statusCode;
  final Map<String, dynamic> body;
  @override
  String toString() {
    final error = body['error'];
    if (error is Map) return error['message']?.toString() ?? 'Request failed';
    return 'Request failed ($statusCode)';
  }
}
