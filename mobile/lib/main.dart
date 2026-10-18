import 'package:flutter/material.dart';
import 'screens/splash_screen.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NasconApp());
}

class NasconApp extends StatelessWidget {
  const NasconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: "NaSCon '26 Platform",
      theme: buildAppTheme(),
      home: const SplashScreen(),
    );
  }
}
