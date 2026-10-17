import 'package:flutter/material.dart';

// ── EWC-inspired palette ───────────────────────────────────────────────────
// Deep tournament blacks, gold champion accent, clean white text
const Color kBg = Color(0xFF0C0C0C);          // deepest background
const Color kSurface = Color(0xFF141414);      // card / surface
const Color kSurface2 = Color(0xFF1C1C1C);    // elevated surface
const Color kBorder = Color(0xFF2A2A2A);       // subtle dividers
const Color kGold = Color(0xFFD4A017);         // champion gold accent
const Color kGoldLight = Color(0xFFE8C547);    // highlight gold
const Color kGreen = Color(0xFF22C55E);        // online / success
const Color kRed = Color(0xFFEF4444);          // eliminated / error
const Color kOrange = Color(0xFFF97316);       // offline / warning
const Color kBlue = Color(0xFF3B82F6);         // upcoming
const Color kMuted = Color(0xFF6B7280);        // secondary text
const Color kText = Color(0xFFF1F1F1);         // primary text

ThemeData buildTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: kBg,
    colorScheme: ColorScheme.dark(
      primary: kGold,
      secondary: kGoldLight,
      surface: kSurface,
      error: kRed,
      onPrimary: Colors.black,
      onSurface: kText,
    ),
    fontFamily: 'Roboto',
    appBarTheme: const AppBarTheme(
      backgroundColor: kBg,
      foregroundColor: kText,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: 'Roboto',
        fontSize: 17,
        fontWeight: FontWeight.w700,
        color: kText,
        letterSpacing: 0.2,
      ),
    ),
    cardTheme: CardThemeData(
      color: kSurface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: kBorder),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kSurface2,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kGold, width: 1.5),
      ),
      labelStyle: const TextStyle(color: kMuted),
      hintStyle: const TextStyle(color: kMuted),
      prefixIconColor: kMuted,
    ),
    dividerTheme: const DividerThemeData(color: kBorder, thickness: 1),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: kSurface,
      indicatorColor: kGold.withValues(alpha: 0.15),
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.5),
      ),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: kGold);
        }
        return const IconThemeData(color: kMuted);
      }),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kSurface2,
      selectedColor: kGold.withValues(alpha: 0.2),
      side: const BorderSide(color: kBorder),
      labelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
  );
}
