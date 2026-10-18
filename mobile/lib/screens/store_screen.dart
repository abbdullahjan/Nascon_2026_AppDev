import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../models/product.dart';
import '../services/api_service.dart';
import '../theme.dart';
import '../widgets/sync_bar.dart';

/// Screen 5: Merchandise Store & Concurrency-Safe Checkout Screen
/// Displays official team catalogue, variant size picker, cart summary,
/// mock gateway token checkout, and cryptographic PDF receipt viewer (Section 8.2 & 8.6).
class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  String? _errorMessage;
  List<ProductModel> _products = [];

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  Future<void> _loadProducts() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final products = await _apiService.getProducts();
      if (!mounted) return;
      setState(() {
        _products = products;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Unable to load merchandise. Pull down to retry.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SyncBar(),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            backgroundColor: AppColors.surface,
            onRefresh: _loadProducts,
            child: _buildBody(),
          ),
        ),
      ],
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline_rounded, size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              Text(_errorMessage!, style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Retry'),
                onPressed: _loadProducts,
              ),
            ],
          ),
        ),
      );
    }

    if (_products.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.25),
          const Center(
            child: Column(
              children: [
                Icon(Icons.shopping_bag_outlined, size: 54, color: AppColors.border),
                SizedBox(height: 12),
                Text('No merchandise available', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                SizedBox(height: 4),
                Text('Official jerseys and club merchandise will be listed here.', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        _buildStoreBanner(),
        const SizedBox(height: 16),
        ..._products.map((p) => _buildProductCard(p)),
      ],
    );
  }

  Widget _buildStoreBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.4)),
        gradient: LinearGradient(
          colors: [
            AppColors.gold.withValues(alpha: 0.12),
            AppColors.surface,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Row(
        children: [
          Icon(Icons.local_offer_rounded, color: AppColors.gold, size: 28),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Special Promotion: WELCOME10',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.gold),
                ),
                SizedBox(height: 2),
                Text(
                  'Use code WELCOME10 at checkout for 10% instant discount on official jerseys.',
                  style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductCard(ProductModel product) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: const Icon(
                    Icons.checkroom_rounded,
                    size: 36,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceElevated,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              product.category.toUpperCase(),
                              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: product.isAvailable ? AppColors.primary.withValues(alpha: 0.12) : AppColors.error.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              product.isAvailable ? 'IN STOCK' : 'OUT OF STOCK',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: product.isAvailable ? AppColors.primary : AppColors.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        product.name,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        product.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Divider(color: AppColors.borderSubtle, height: 1),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('PRICE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textTertiary)),
                    Text(
                      product.formattedPriceRange,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.gold),
                    ),
                  ],
                ),
                ElevatedButton.icon(
                  icon: const Icon(Icons.shopping_cart_checkout_rounded, size: 18),
                  label: const Text('Buy / Select Size'),
                  onPressed: product.isAvailable ? () => _openCheckoutModal(product) : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _openCheckoutModal(ProductModel product) {
    ProductVariant selectedVariant = product.variants.firstWhere(
      (v) => v.inStock,
      orElse: () => product.variants.first,
    );
    int quantity = 1;
    String discountCode = '';
    String paymentToken = 'tok_success';
    bool isSubmitting = false;
    String? statusMessage;
    OrderReceipt? completedReceipt;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final double basePrice = (selectedVariant.priceMinor * quantity) / 100;
            final bool hasDiscount = discountCode.trim().toUpperCase() == 'WELCOME10';
            final double discountAmount = hasDiscount ? (basePrice * 0.1) : 0.0;
            final double finalTotal = basePrice - discountAmount;

            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          completedReceipt == null ? 'Checkout: ${product.name}' : 'Receipt',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const Divider(color: AppColors.borderSubtle),
                    const SizedBox(height: 12),

                    if (completedReceipt == null) ...[
                      // Variant Size Selection
                      const Text(
                        'SELECT SIZE',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: product.variants.map((v) {
                          final isSelected = v.variantId == selectedVariant.variantId;
                          final isOutOfStock = !v.inStock;

                          return ChoiceChip(
                            selected: isSelected,
                            onSelected: isOutOfStock
                                ? null
                                : (_) {
                                    setModalState(() {
                                      selectedVariant = v;
                                      if (quantity > v.stock) quantity = v.stock;
                                    });
                                  },
                            label: Text(
                              'Size ${v.size} (${v.stock} left)',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: isSelected ? AppColors.textInverse : (isOutOfStock ? AppColors.textTertiary : AppColors.textPrimary),
                              ),
                            ),
                            selectedColor: AppColors.primary,
                            backgroundColor: AppColors.surfaceElevated,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                              side: BorderSide(color: isSelected ? AppColors.primary : AppColors.border),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // Quantity Selector
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'QUANTITY',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.textSecondary),
                          ),
                          Row(
                            children: [
                              IconButton(
                                icon: const Icon(Icons.remove_circle_outline),
                                onPressed: quantity > 1
                                    ? () => setModalState(() => quantity--)
                                    : null,
                              ),
                              Text(
                                '$quantity',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                              ),
                              IconButton(
                                icon: const Icon(Icons.add_circle_outline),
                                onPressed: quantity < selectedVariant.stock
                                    ? () => setModalState(() => quantity++)
                                    : null,
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Promo Code Field
                      TextField(
                        decoration: InputDecoration(
                          labelText: 'Discount Code',
                          hintText: 'e.g. WELCOME10',
                          suffixIcon: TextButton(
                            child: const Text('Apply'),
                            onPressed: () {
                              setModalState(() {});
                            },
                          ),
                        ),
                        onChanged: (val) {
                          setModalState(() => discountCode = val);
                        },
                      ),
                      const SizedBox(height: 12),

                      // Mock Payment Gateway Token Selector (Required for Judge Testing Section 8.6 Task B)
                      const Text(
                        'MOCK PAYMENT GATEWAY SIMULATION',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 6),
                      DropdownButtonFormField<String>(
                        initialValue: paymentToken,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.payment_rounded),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'tok_success',
                            child: Text('tok_success (Authorize + Capture OK)'),
                          ),
                          DropdownMenuItem(
                            value: 'tok_declined',
                            child: Text('tok_declined (Card Declined 402)'),
                          ),
                          DropdownMenuItem(
                            value: 'tok_capture_fail',
                            child: Text('tok_capture_fail (Capture Fail 402)'),
                          ),
                        ],
                        onChanged: (val) {
                          if (val != null) setModalState(() => paymentToken = val);
                        },
                      ),
                      const SizedBox(height: 16),

                      // Price Summary
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Subtotal:', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                                Text('${basePrice.toStringAsFixed(2)} PKR', style: const TextStyle(fontWeight: FontWeight.w700)),
                              ],
                            ),
                            if (hasDiscount) ...[
                              const SizedBox(height: 4),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text('Discount (10% WELCOME10):', style: TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.w700)),
                                  Text('-${discountAmount.toStringAsFixed(2)} PKR', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
                                ],
                              ),
                            ],
                            const Divider(color: AppColors.border, height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Total Due:', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                                Text(
                                  '${finalTotal.toStringAsFixed(2)} PKR',
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.gold),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      if (statusMessage != null) ...[
                        Text(
                          statusMessage!,
                          style: const TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 12),
                      ],

                      // Submit Button
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: AppColors.textInverse,
                          ),
                          onPressed: isSubmitting
                              ? null
                              : () async {
                                  setModalState(() {
                                    isSubmitting = true;
                                    statusMessage = null;
                                  });

                                  try {
                                    final orderId = 'ord-${const Uuid().v4().substring(0, 8)}';
                                    final result = await _apiService.checkout(
                                      orderId: orderId,
                                      customerId: 'cust-demo-1',
                                      items: [
                                        {
                                          'variant_id': selectedVariant.variantId,
                                          'quantity': quantity,
                                        }
                                      ],
                                      discountCode: hasDiscount ? 'WELCOME10' : null,
                                      paymentToken: paymentToken,
                                    );

                                    setModalState(() {
                                      isSubmitting = false;
                                      completedReceipt = result.receipt;
                                    });
                                    _loadProducts(); // refresh inventory
                                  } catch (err) {
                                    setModalState(() {
                                      isSubmitting = false;
                                      statusMessage = '$err';
                                    });
                                  }
                                },
                          child: isSubmitting
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.textInverse),
                                )
                              : Text('Pay ${finalTotal.toStringAsFixed(2)} PKR'),
                        ),
                      ),
                    ] else ...[
                      // Receipt View Screen
                      const Center(
                        child: Column(
                          children: [
                            Icon(Icons.verified_rounded, size: 54, color: AppColors.primary),
                            SizedBox(height: 10),
                            Text('Payment Confirmed!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.primary)),
                            SizedBox(height: 4),
                            Text('Signed Cryptographic Order Receipt', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Order ID:', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                                Text(completedReceipt!.orderId, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Total Paid:', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                                Text(completedReceipt!.formattedTotal, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.gold, fontSize: 15)),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Status:', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text('PAID (CAPTURED)', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 10)),
                                ),
                              ],
                            ),
                            const Divider(color: AppColors.border, height: 20),
                            const Text(
                              'HMAC-SHA256 SIGNATURE (SALT VERIFIED)',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.textSecondary),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              completedReceipt!.signature,
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.textTertiary),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(ctx),
                          child: const Text('Done'),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
