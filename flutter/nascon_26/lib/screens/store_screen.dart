import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';

const _uuid = Uuid();

// ─────────────────────────────────────────────────────────────────────────────
// STORE SCREEN
// ─────────────────────────────────────────────────────────────────────────────
class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});
  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  final _variants = [
    {'id': 'var-jersey-001-M', 'name': 'Alpha Home Jersey', 'size': 'Medium', 'price': 450000, 'stock': -1},
    {'id': 'var-jersey-001-L', 'name': 'Alpha Home Jersey', 'size': 'Large',  'price': 450000, 'stock': -1},
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadInventory());
  }

  Future<void> _loadInventory() async {
    final state = AppStateScope.of(context);
    if (!state.online) return;
    for (var i = 0; i < _variants.length; i++) {
      try {
        final r = await ApiClient().getInventory(_variants[i]['id'] as String);
        if (mounted) setState(() => _variants[i]['stock'] = (r['stock'] as int?) ?? 0);
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
      const SizedBox(height: 8),
      const Eyebrow('Official Merchandise'),
      const SizedBox(height: 6),
      const HeadlineText('Club Store'),
      const SizedBox(height: 4),
      const Text('Matchday gear — checkout with zero overselling',
          style: TextStyle(color: kMuted, fontSize: 12)),
      const SizedBox(height: 16),

      // Hero banner
      GoldBanner(
        height: 130,
        child: Stack(children: [
          Positioned(
            right: -10, top: -20,
            child: Icon(Icons.checkroom_rounded, size: 130,
                color: kGold.withValues(alpha: 0.06)),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Eyebrow('Alpha Sports · Official'),
            const Spacer(),
            const Text('MATCHDAY\nCOLLECTION 2026',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900,
                    color: kText, height: 1.1)),
            const SizedBox(height: 4),
            Text('PKR 4,500.00 per item',
                style: TextStyle(color: kGold.withValues(alpha: 0.7), fontSize: 11)),
          ]),
        ]),
      ),
      const SizedBox(height: 16),

      SectionTitle('Products',
          trailing: StatusBadge('${state.cartCount} IN CART',
              color: state.cartCount > 0 ? kGold : kMuted)),
      const SizedBox(height: 10),

      ..._variants.map((v) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: _ProductCard(
          variant: v,
          qty: state.cart[v['id'] as String] ?? 0,
          onAdd: () => state.addToCart(v['id'] as String),
          onRemove: () => state.removeFromCart(v['id'] as String),
        ),
      )),
      const SizedBox(height: 16),

      // Discount code info
      Panel(child: Row(children: [
        const Icon(Icons.local_offer_outlined, color: kGold, size: 20),
        const SizedBox(width: 10),
        const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Discount code', style: TextStyle(fontWeight: FontWeight.w700)),
          Text('Use WELCOME10 at checkout for 10% off',
              style: TextStyle(color: kMuted, fontSize: 11)),
        ])),
      ])),
      const SizedBox(height: 16),

      PrimaryButton(
        label: 'Checkout (${state.cartCount} item${state.cartCount == 1 ? '' : 's'})',
        icon: Icons.shopping_bag_outlined,
        onPressed: state.cartCount == 0
            ? null
            : () => _openCheckout(context, state),
      ),
    ]);
  }

  Future<void> _openCheckout(BuildContext context, AppState state) async {
    final result = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
            builder: (_) => _CheckoutScreen(variants: _variants)));
    if (result == true) {
      setState(() {});
      await _loadInventory();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CARD
// ─────────────────────────────────────────────────────────────────────────────
class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.variant,
    required this.qty,
    required this.onAdd,
    required this.onRemove,
  });
  final Map<String, dynamic> variant;
  final int qty;
  final VoidCallback onAdd, onRemove;

  @override
  Widget build(BuildContext context) {
    final stock = variant['stock'] as int;
    final inStock = stock == -1 || stock > 0;
    return Panel(child: Row(children: [
      Container(
        width: 72, height: 72,
        decoration: BoxDecoration(
          color: kGold.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: kGold.withValues(alpha: 0.2)),
        ),
        child: const Icon(Icons.checkroom_rounded, color: kGold, size: 36),
      ),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(variant['name'] as String,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
        const SizedBox(height: 2),
        Text('Size: ${variant['size']}',
            style: const TextStyle(color: kMuted, fontSize: 11)),
        const SizedBox(height: 4),
        Row(children: [
          Text(formatMoney(variant['price'] as int),
              style: const TextStyle(color: kGold, fontWeight: FontWeight.w900, fontSize: 13)),
          const SizedBox(width: 8),
          if (stock >= 0)
            StatusBadge(stock > 0 ? '$stock LEFT' : 'SOLD OUT',
                color: stock > 0 ? kGreen : kRed),
        ]),
      ])),
      Column(children: [
        if (qty > 0) ...[
          Text('$qty', style: const TextStyle(
              color: kGold, fontWeight: FontWeight.w900, fontSize: 16)),
          const SizedBox(height: 4),
          Row(children: [
            _SmallBtn(Icons.remove_rounded, onRemove),
            const SizedBox(width: 6),
            _SmallBtn(Icons.add_rounded, inStock ? onAdd : null),
          ]),
        ] else
          _SmallBtn(Icons.add_rounded, inStock ? onAdd : null, accent: true),
      ]),
    ]));
  }
}

class _SmallBtn extends StatelessWidget {
  const _SmallBtn(this.icon, this.onTap, {this.accent = false});
  final IconData icon;
  final VoidCallback? onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 32, height: 32,
      decoration: BoxDecoration(
        color: accent ? kGold : kSurface2,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: accent ? kGold : kBorder),
      ),
      child: Icon(icon, size: 16,
          color: accent
              ? Colors.black
              : (onTap != null ? kText : kMuted)),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT SCREEN
// ─────────────────────────────────────────────────────────────────────────────
class _CheckoutScreen extends StatefulWidget {
  const _CheckoutScreen({required this.variants});
  final List<Map<String, dynamic>> variants;
  @override
  State<_CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<_CheckoutScreen> {
  final _discountCtrl = TextEditingController();
  String _payToken = 'tok_success';
  bool _loading = false;
  String? _discountError;
  int _discountMinor = 0;

  @override
  void dispose() {
    _discountCtrl.dispose();
    super.dispose();
  }

  void _applyDiscount(int subtotal) {
    final code = _discountCtrl.text.trim().toUpperCase();
    if (code.isEmpty) {
      setState(() { _discountMinor = 0; _discountError = null; });
      return;
    }
    if (code == 'WELCOME10') {
      setState(() { _discountMinor = subtotal * 10 ~/ 100; _discountError = null; });
    } else {
      setState(() { _discountMinor = 0; _discountError = 'Invalid discount code'; });
    }
  }

  Future<void> _placeOrder(BuildContext context, AppState state) async {
    final items = state.cart.entries
        .map((e) => {'variant_id': e.key, 'quantity': e.value})
        .toList();
    if (items.isEmpty) return;

    setState(() => _loading = true);
    try {
      final orderId = 'ord_${_uuid.v4().substring(0, 8)}';
      final discCode = _discountCtrl.text.trim().toUpperCase();
      final response = await ApiClient().checkout({
        'order_id': orderId,
        'customer_id': state.userName,
        'items': items,
        'discount_code': discCode.isEmpty ? null : discCode,
        'payment': {'token': _payToken},
      });
      state.clearCart();
      if (!mounted) return;
      Navigator.pushReplacement(context,
          MaterialPageRoute(builder: (_) => _ReceiptScreen(order: response)));
    } catch (e) {
      if (!mounted) return;
      final code = ApiClient.errorCode(e); // handles MockPaymentException + real errors
      final msg = _friendlyError(code, ApiClient.errorMessage(e));
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(msg), backgroundColor: kRed));
    }
    setState(() => _loading = false);
  }

  String _friendlyError(String? code, String fallback) {
    switch (code) {
      case 'OUT_OF_STOCK':           return 'Sorry, one of the items is out of stock';
      case 'PAYMENT_DECLINED':       return 'Payment was declined. Try a different token.';
      case 'PAYMENT_CAPTURE_FAILED': return 'Capture failed. Please try again.';
      case 'INVALID_DISCOUNT_CODE':  return 'That discount code is not valid';
      case 'VARIANT_NOT_FOUND':      return 'One of the items is no longer available';
      default:                       return fallback;
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    int subtotal = 0;
    for (final v in widget.variants) {
      final qty = state.cart[v['id'] as String] ?? 0;
      subtotal += (v['price'] as int) * qty;
    }
    final total = subtotal - _discountMinor;

    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(title: const Text('Checkout')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SectionTitle('Order Summary'),
          const SizedBox(height: 10),
          ...widget.variants.map((v) {
            final qty = state.cart[v['id'] as String] ?? 0;
            if (qty == 0) return const SizedBox.shrink();
            return Panel(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                Text(v['name'] as String,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                StatusBadge(v['size'] as String, color: kMuted),
                const Spacer(),
                Text('× $qty',
                    style: const TextStyle(color: kMuted, fontSize: 12)),
                const SizedBox(width: 8),
                Text(formatMoney((v['price'] as int) * qty),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: kGold)),
              ]),
            );
          }),
          const SizedBox(height: 14),

          const SectionTitle('Discount Code'),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(
              controller: _discountCtrl,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                hintText: 'WELCOME10',
                errorText: _discountError,
                prefixIcon: const Icon(Icons.local_offer_outlined),
              ),
            )),
            const SizedBox(width: 10),
            ElevatedButton(
              onPressed: () => _applyDiscount(subtotal),
              style: ElevatedButton.styleFrom(
                backgroundColor: kSurface2,
                foregroundColor: kGold,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
              child: const Text('Apply'),
            ),
          ]),
          const SizedBox(height: 14),

          Panel(child: Column(children: [
            _row('Subtotal', formatMoney(subtotal)),
            if (_discountMinor > 0)
              _row('Discount (10%)', '- ${formatMoney(_discountMinor)}',
                  color: kGreen),
            const Divider(color: kBorder, height: 16),
            _row('Total', formatMoney(total), big: true),
          ])),
          const SizedBox(height: 14),

          const SectionTitle('Payment (Mock Gateway)'),
          const SizedBox(height: 8),
          ...[
            ('tok_success',      'Authorize + Capture (Success)'),
            ('tok_declined',     'Authorization Fails'),
            ('tok_capture_fail', 'Authorization OK, Capture Fails'),
          ].map((t) => RadioListTile<String>(
            value: t.$1,
            groupValue: _payToken,
            onChanged: (v) => setState(() => _payToken = v!),
            title: Text(t.$2, style: const TextStyle(fontSize: 13)),
            subtitle: Text(t.$1,
                style: const TextStyle(
                    color: kMuted, fontSize: 10, fontFamily: 'monospace')),
            activeColor: kGold,
            contentPadding: EdgeInsets.zero,
          )),
          const SizedBox(height: 20),

          PrimaryButton(
            label: 'Place Order',
            icon: Icons.check_circle_outline_rounded,
            onPressed: _loading ? null : () => _placeOrder(context, state),
            loading: _loading,
          ),
        ]),
      ),
    );
  }

  Widget _row(String label, String value, {Color? color, bool big = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Text(label, style: TextStyle(
              color: big ? kText : kMuted,
              fontWeight: big ? FontWeight.w700 : FontWeight.w500,
              fontSize: big ? 15 : 13)),
          const Spacer(),
          Text(value, style: TextStyle(
              color: color ?? (big ? kGold : kText),
              fontWeight: big ? FontWeight.w900 : FontWeight.w600,
              fontSize: big ? 16 : 13)),
        ]),
      );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT SCREEN
// ─────────────────────────────────────────────────────────────────────────────
class _ReceiptScreen extends StatelessWidget {
  const _ReceiptScreen({required this.order});
  final Map<String, dynamic> order;

  @override
  Widget build(BuildContext context) {
    final receipt = order['receipt'] as Map<String, dynamic>?;
    final payload = receipt?['payload'] as Map<String, dynamic>?;

    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        title: const Text('Receipt'),
        leading: IconButton(
          icon: const Icon(Icons.home_rounded),
          onPressed: () => Navigator.pop(context, true),
        ),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        GoldBanner(height: 100, child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Eyebrow('Order confirmed'),
          const Spacer(),
          const Icon(Icons.check_circle_rounded, color: kGreen, size: 28),
          const SizedBox(height: 4),
          Text(order['order_id'] as String? ?? '',
              style: const TextStyle(
                  fontWeight: FontWeight.w900, fontSize: 15, color: kText)),
        ])),
        const SizedBox(height: 16),

        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
            children: [
          const SectionTitle('Items'),
          const SizedBox(height: 8),
          ...((payload?['items'] as List?) ?? []).map((item) {
            final i = item as Map<String, dynamic>;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Expanded(child: Text(i['variant_id'] as String? ?? '',
                    style: const TextStyle(fontSize: 12))),
                Text('× ${i['quantity']}',
                    style: const TextStyle(color: kMuted, fontSize: 12)),
                const SizedBox(width: 8),
                Text(formatMoney(i['unit_price_minor'] as int? ?? 0),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: kGold)),
              ]),
            );
          }),
          const Divider(color: kBorder, height: 16),
          Row(children: [
            const Text('Total', style: TextStyle(
                fontWeight: FontWeight.w900, fontSize: 16)),
            const Spacer(),
            Text(
              formatMoney(payload?['total_minor'] as int?
                  ?? order['total_minor'] as int? ?? 0),
              style: const TextStyle(
                  fontWeight: FontWeight.w900, color: kGold, fontSize: 16),
            ),
          ]),
          const SizedBox(height: 8),
          Text('Paid at: ${payload?['paid_at'] ?? ''}',
              style: const TextStyle(color: kMuted, fontSize: 11)),
        ])),
        const SizedBox(height: 14),

        Panel(child: Row(children: [
          const Icon(Icons.receipt_long_rounded, color: kGold),
          const SizedBox(width: 10),
          const Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('PDF Receipt',
                style: TextStyle(fontWeight: FontWeight.w700)),
            Text('Server-signed receipt available',
                style: TextStyle(color: kMuted, fontSize: 11)),
          ])),
          OutlinedButton(
            onPressed: receipt?['pdf_base64'] != null
                ? () => _downloadPdf(context, receipt!)
                : null,
            style: OutlinedButton.styleFrom(
                foregroundColor: kGold,
                side: const BorderSide(color: kGold)),
            child: const Text('Download'),
          ),
        ])),
        const SizedBox(height: 20),

        GhostButton(
          label: 'Back to Store',
          icon: Icons.arrow_back_rounded,
          onPressed: () => Navigator.pop(context, true),
        ),
      ]),
    );
  }

  Future<void> _downloadPdf(
      BuildContext context, Map<String, dynamic> receipt) async {
    // PDF download requires native file I/O — show a confirmation for UI testing
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('PDF receipt would download here when backend is connected.'),
        duration: Duration(seconds: 3),
      ),
    );
  }
}
