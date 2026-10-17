import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../widgets/ui.dart';

class StoreScreen extends StatelessWidget {
  const StoreScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return ListView(padding: const EdgeInsets.fromLTRB(18, 4, 18, 24), children: [
      const Eyebrow('Official club merchandise'),
      const SizedBox(height: 8),
      const Text('Club Store', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: -1)),
      const SizedBox(height: 6),
      const Text('Matchday gear. Checkout built for zero overselling.', style: TextStyle(color: muted)),
      const SizedBox(height: 18),
      Container(height: 170, padding: const EdgeInsets.all(20), decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(colors: [Color(0xFF273D23), Color(0xFF121815)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        border: Border.all(color: lime.withValues(alpha: .25)),
      ), child: Stack(children: [
        const Positioned(right: 2, top: 4, child: Icon(Icons.sports_soccer_rounded, size: 110, color: Color(0x449FE870))),
        const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Eyebrow('Alpha Sports · Official'),
          Spacer(),
          Text('MATCHDAY', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -1)),
          Text('COLLECTION 2026', style: TextStyle(color: lime, letterSpacing: 2, fontWeight: FontWeight.w900, fontSize: 10)),
        ]),
      ])),
      const SizedBox(height: 18),
      Row(children: [const Expanded(child: SectionTitle('Featured products')), StatusPill(label: '${state.cartCount} IN CART')]),
      const SizedBox(height: 12),
      _ProductCard(name:'Alpha Home Jersey', type:'APPAREL · 2026 KIT', price:'PKR 4,500', variant:'var-jersey-001-M', icon:Icons.checkroom_rounded, onAdd:() => state.addToCart('var-jersey-001-M')),
      const SizedBox(height: 10),
      _ProductCard(name:'Alpha Away Jersey', type:'APPAREL · AWAY KIT', price:'PKR 4,500', variant:'var-jersey-001-L', icon:Icons.dry_cleaning_rounded, onAdd:() => state.addToCart('var-jersey-001-L')),
      const SizedBox(height: 16),
      const Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Eyebrow('Secure mock checkout'),
        SizedBox(height: 7),
        Text('Reserve → authorize → capture', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
        SizedBox(height: 6),
        Text('The backend owns stock reservation and payment simulation. A receipt should be signed and generated server-side.', style: TextStyle(color: muted, fontSize: 12, height: 1.5)),
      ])),
      const SizedBox(height: 16),
      PrimaryButton(label: 'Review cart (${state.cartCount})', icon: Icons.shopping_bag_outlined, onPressed: state.cartCount == 0 ? null : () => _checkout(context, state)),
    ]);
  }

  Future<void> _checkout(BuildContext context, AppState state) async {
    final items = state.cart.entries.map((e) => '${e.key}: ${e.value}').join('\n');
    final result = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Review your cart'),
      content: Text('$items\n\nDemo payment token: tok_success'),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep shopping')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Place mock order'))],
    ));
    if (result != true) return;
    try {
      final response = await state.api.post('/audit/v1/checkout', {
        'order_id':'ord-${DateTime.now().microsecondsSinceEpoch}',
        'customer_id': state.userName,
        'items': state.cart.entries.map((e) => {'variant_id':e.key,'quantity':e.value}).toList(),
        'discount_code':null,
        'payment':{'token':'tok_success'},
      });
      state.clearCart();
      if (context.mounted) {
        showDialog(context: context, builder: (ctx) => AlertDialog(
          title: const Text('Order confirmed'),
          content: Text('Order ${response['order_id'] ?? ''}\nTotal: ${response['total_minor'] ?? ''} minor units\n\nReceipt response received from backend.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Done'))],
        ));
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Checkout unavailable: ${e.toString()}')));
    }
  }
}
class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.name, required this.type, required this.price, required this.variant, required this.icon, required this.onAdd});
  final String name, type, price, variant; final IconData icon; final VoidCallback onAdd;
  @override
  Widget build(BuildContext context) => Panel(child: Row(children: [
    Container(width: 78, height: 92, decoration: BoxDecoration(color: const Color(0xFF202D20), borderRadius: BorderRadius.circular(16)), child: Icon(icon, size: 42, color: lime)),
    const SizedBox(width: 14),
    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(type, style: const TextStyle(color: muted, fontSize: 9, letterSpacing: 1, fontWeight: FontWeight.w900)),
      const SizedBox(height: 7), Text(name, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
      const SizedBox(height: 6), Text(price, style: const TextStyle(color: lime, fontWeight: FontWeight.w900)),
      const SizedBox(height: 4), Text('Variant: ${variant.endsWith('M') ? 'Medium' : 'Large'}', style: const TextStyle(color: muted, fontSize: 10)),
    ])),
    IconButton(onPressed: onAdd, tooltip: 'Add to cart', style: IconButton.styleFrom(backgroundColor: lime, foregroundColor: const Color(0xFF10160E)), icon: const Icon(Icons.add_rounded)),
  ]));
}
