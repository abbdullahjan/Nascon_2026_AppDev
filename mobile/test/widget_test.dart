import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nascon_26/core/permissions.dart';
import 'package:nascon_26/main.dart';
import 'package:nascon_26/screens/fixtures_screen.dart';
import 'package:nascon_26/screens/role_home.dart';
import 'package:nascon_26/theme.dart';
import 'package:nascon_26/widgets/sync_bar.dart';

void main() {
  testWidgets('app launches on splash screen and displays NaSCon title',
      (WidgetTester tester) async {
    await tester.pumpWidget(const NasconApp());
    expect(find.text("NaSCon '26"), findsOneWidget);
  });

  group('Role router permissions matrix verification', () {
    test('super_admin has 6 tabs and defaults to Admin', () {
      final tabs = RolePermissions.getTabsForRole('super_admin');
      expect(tabs.length, 6);
      expect(
        tabs.map((t) => t.label).toList(),
        ['Fixtures', 'Standings', 'Leagues', 'Clubs', 'Store', 'Admin'],
      );
      final defaultIdx = RolePermissions.getDefaultTabIndexForRole('super_admin');
      expect(tabs[defaultIdx].label, 'Admin');
    });

    test('league_organizer has 4 tabs and defaults to Fixtures', () {
      final tabs = RolePermissions.getTabsForRole('league_organizer');
      expect(tabs.length, 4);
      expect(
        tabs.map((t) => t.label).toList(),
        ['Fixtures', 'Standings', 'Scoring Entry', 'Leagues'],
      );
      final defaultIdx =
          RolePermissions.getDefaultTabIndexForRole('league_organizer');
      expect(tabs[defaultIdx].label, 'Fixtures');
    });

    test('club_manager has 4 tabs and defaults to My Club', () {
      final tabs = RolePermissions.getTabsForRole('club_manager');
      expect(tabs.length, 4);
      expect(
        tabs.map((t) => t.label).toList(),
        ['My Club', 'Roster Management', 'Fixtures', 'Store'],
      );
      final defaultIdx = RolePermissions.getDefaultTabIndexForRole('club_manager');
      expect(tabs[defaultIdx].label, 'My Club');
    });

    test('player has 3 tabs and defaults to My Profile', () {
      final tabs = RolePermissions.getTabsForRole('player');
      expect(tabs.length, 3);
      expect(
        tabs.map((t) => t.label).toList(),
        ['Fixtures', 'Standings', 'My Profile'],
      );
      final defaultIdx = RolePermissions.getDefaultTabIndexForRole('player');
      expect(tabs[defaultIdx].label, 'My Profile');
    });

    test('viewer has 3 tabs and defaults to Fixtures', () {
      final tabs = RolePermissions.getTabsForRole('viewer');
      expect(tabs.length, 3);
      expect(
        tabs.map((t) => t.label).toList(),
        ['Fixtures', 'Standings', 'Store'],
      );
      final defaultIdx = RolePermissions.getDefaultTabIndexForRole('viewer');
      expect(tabs[defaultIdx].label, 'Fixtures');
    });
  });

  testWidgets('role_home renders Super Admin with 6 bottom navigation destinations',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: const RoleHomeScreen(role: 'super_admin'),
      ),
    );

    expect(find.text('Admin'), findsWidgets);
    expect(find.text('Super Admin'), findsOneWidget);
    expect(find.text('Fixtures'), findsOneWidget);
    expect(find.text('Standings'), findsOneWidget);
    expect(find.text('Leagues'), findsOneWidget);
    expect(find.text('Clubs'), findsOneWidget);
    expect(find.text('Store'), findsOneWidget);
  });

  testWidgets('fixtures placeholder button pushes match_detail and pops back',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: const Scaffold(body: FixturesScreen()),
      ),
    );

    expect(find.text('Fixtures screen - coming soon'), findsOneWidget);
    final pushButton = find.text('View Match Details (Test Push)');
    expect(pushButton, findsOneWidget);

    await tester.tap(pushButton);
    await tester.pumpAndSettle();

    expect(find.text('Match Detail screen - coming soon'), findsOneWidget);
    expect(find.text('Back to Fixtures'), findsOneWidget);

    await tester.tap(find.text('Back to Fixtures'));
    await tester.pumpAndSettle();

    expect(find.text('Fixtures screen - coming soon'), findsOneWidget);
  });

  testWidgets('sync bar tap opens pending queue screen',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: const Scaffold(body: SyncBar()),
      ),
    );

    final syncBar = find.byType(SyncBar);
    expect(syncBar, findsOneWidget);

    await tester.tap(syncBar);
    await tester.pumpAndSettle();

    expect(find.text('Pending Queue screen - coming soon'), findsOneWidget);
  });
}
