import 'package:flutter/material.dart';
import 'core/app_state.dart';
import 'screens/app_shell.dart';

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
    const seed = Color(0xFF9FE870);
    return AppStateScope(
      state: state,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'NEXUS • League OS',
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.dark,
          scaffoldBackgroundColor: const Color(0xFF0A0E0C),
          colorScheme: ColorScheme.fromSeed(
            seedColor: seed,
            brightness: Brightness.dark,
            surface: const Color(0xFF121815),
          ),
          fontFamily: 'Roboto',
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xFF0A0E0C),
            foregroundColor: Colors.white,
            elevation: 0,
          ),
          cardTheme: CardThemeData(
            color: const Color(0xFF121815),
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: Color(0xFF273129)),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFF161D18),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFF2C382F)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFF2C382F)),
            ),
          ),
        ),
        home: const AppShell(),
      ),
    );
  }
}
