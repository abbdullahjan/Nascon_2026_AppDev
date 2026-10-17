import 'package:flutter/material.dart';
import 'core/app_state.dart';
import 'core/api_client.dart';
import 'core/theme.dart';
import 'screens/splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();
  await state.initialize();
  runApp(NasconApp(state: state));
}

class NasconApp extends StatelessWidget {
  const NasconApp({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppStateScope(
      state: state,
      child: MaterialApp(
        navigatorKey: navigatorKey,
        debugShowCheckedModeBanner: false,
        title: 'NaSCon \'26',
        theme: buildTheme(isDark: false),
        darkTheme: buildTheme(isDark: true),
        themeMode: state.isDarkMode ? ThemeMode.dark : ThemeMode.light,
        home: const SplashScreen(),
      ),
    );
  }
}
