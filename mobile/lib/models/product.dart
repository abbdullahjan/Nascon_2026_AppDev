import 'dart:convert';

/// A variant of a merchandise product (e.g., Size M, L, XL).
class ProductVariant {
  final String variantId;
  final String sku;
  final String size;
  final String color;
  final int priceMinor;
  final String currency;
  final int stock;
  final int reserved;

  ProductVariant({
    required this.variantId,
    required this.sku,
    required this.size,
    required this.color,
    required this.priceMinor,
    required this.currency,
    required this.stock,
    this.reserved = 0,
  });

  String get formattedPrice => '${(priceMinor / 100).toStringAsFixed(2)} $currency';
  bool get inStock => stock > 0;

  factory ProductVariant.fromJson(Map<String, dynamic> json) {
    return ProductVariant(
      variantId: json['variant_id']?.toString() ?? '',
      sku: json['sku']?.toString() ?? '',
      size: json['size']?.toString() ?? 'Standard',
      color: json['color']?.toString() ?? 'Default',
      priceMinor: json['price_minor'] is int ? json['price_minor'] : int.tryParse(json['price_minor']?.toString() ?? '0') ?? 0,
      currency: json['currency']?.toString() ?? 'PKR',
      stock: json['stock'] is int ? json['stock'] : int.tryParse(json['stock']?.toString() ?? '0') ?? 0,
      reserved: json['reserved'] is int ? json['reserved'] : int.tryParse(json['reserved']?.toString() ?? '0') ?? 0,
    );
  }
}

/// Merchandise product catalog item.
class ProductModel {
  final String productId;
  final String tenantId;
  final String name;
  final String category;
  final String description;
  final String imageUrl;
  final List<ProductVariant> variants;

  ProductModel({
    required this.productId,
    required this.tenantId,
    required this.name,
    required this.category,
    required this.description,
    required this.imageUrl,
    required this.variants,
  });

  int get minPriceMinor {
    if (variants.isEmpty) return 0;
    return variants.map((v) => v.priceMinor).reduce((a, b) => a < b ? a : b);
  }

  String get formattedPriceRange {
    if (variants.isEmpty) return '0.00 PKR';
    final min = minPriceMinor / 100;
    return '${min.toStringAsFixed(2)} PKR';
  }

  bool get isAvailable => variants.any((v) => v.inStock);

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> metaMap = {};
    if (json['meta'] is Map) {
      metaMap = Map<String, dynamic>.from(json['meta']);
    } else if (json['meta'] is String) {
      try {
        metaMap = jsonDecode(json['meta']);
      } catch (_) {}
    }

    List<ProductVariant> vList = [];
    if (json['variants'] is List) {
      vList = (json['variants'] as List)
          .whereType<Map>()
          .map((v) => ProductVariant.fromJson(Map<String, dynamic>.from(v)))
          .toList();
    }

    return ProductModel(
      productId: json['product_id']?.toString() ?? '',
      tenantId: json['tenant_id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Merchandise',
      category: metaMap['category']?.toString() ?? 'Apparel',
      description: metaMap['description']?.toString() ?? 'Official Merchandise',
      imageUrl: metaMap['image_url']?.toString() ?? '',
      variants: vList,
    );
  }
}

/// Receipt generated after successful checkout.
class OrderReceipt {
  final String orderId;
  final String signature;
  final String? pdfBase64;
  final int totalMinor;
  final String currency;
  final String? paidAt;

  OrderReceipt({
    required this.orderId,
    required this.signature,
    this.pdfBase64,
    required this.totalMinor,
    required this.currency,
    this.paidAt,
  });

  String get formattedTotal => '${(totalMinor / 100).toStringAsFixed(2)} $currency';

  factory OrderReceipt.fromJson(Map<String, dynamic> json) {
    final payload = json['payload'] is Map ? Map<String, dynamic>.from(json['payload']) : {};
    return OrderReceipt(
      orderId: payload['order_id']?.toString() ?? json['order_id']?.toString() ?? '',
      signature: json['signature']?.toString() ?? '',
      pdfBase64: json['pdf_base64']?.toString(),
      totalMinor: payload['total_minor'] is int ? payload['total_minor'] : int.tryParse(payload['total_minor']?.toString() ?? '0') ?? 0,
      currency: payload['currency']?.toString() ?? 'PKR',
      paidAt: payload['paid_at']?.toString(),
    );
  }
}

/// Checkout completion result.
class CheckoutResult {
  final String orderId;
  final String status;
  final int subtotalMinor;
  final int discountMinor;
  final int totalMinor;
  final String currency;
  final OrderReceipt? receipt;

  CheckoutResult({
    required this.orderId,
    required this.status,
    required this.subtotalMinor,
    required this.discountMinor,
    required this.totalMinor,
    required this.currency,
    this.receipt,
  });

  String get formattedTotal => '${(totalMinor / 100).toStringAsFixed(2)} $currency';

  factory CheckoutResult.fromJson(Map<String, dynamic> json) {
    return CheckoutResult(
      orderId: json['order_id']?.toString() ?? '',
      status: json['status']?.toString() ?? 'paid',
      subtotalMinor: json['subtotal_minor'] is int ? json['subtotal_minor'] : int.tryParse(json['subtotal_minor']?.toString() ?? '0') ?? 0,
      discountMinor: json['discount_minor'] is int ? json['discount_minor'] : int.tryParse(json['discount_minor']?.toString() ?? '0') ?? 0,
      totalMinor: json['total_minor'] is int ? json['total_minor'] : int.tryParse(json['total_minor']?.toString() ?? '0') ?? 0,
      currency: json['currency']?.toString() ?? 'PKR',
      receipt: json['receipt'] is Map ? OrderReceipt.fromJson(Map<String, dynamic>.from(json['receipt'])) : null,
    );
  }
}
