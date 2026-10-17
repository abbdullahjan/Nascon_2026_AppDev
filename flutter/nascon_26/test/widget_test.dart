// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:nascon_26/main.dart';
import 'package:nascon_26/core/app_state.dart';

void main() {
  testWidgets('app opens on the league overview', (WidgetTester tester) async {
    await tester.pumpWidget(NasconApp(state: AppState()));

    expect(find.text('NEXUS'), findsOneWidget);
    expect(find.text('Overview'), findsWidgets);
    expect(find.text('General Viewer'), findsOneWidget);
  });
}
