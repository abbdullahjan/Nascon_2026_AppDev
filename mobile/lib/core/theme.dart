import 'package:flutter/material.dart';

// ─────────────────────────────────────────────────────────────────────────────
// THEME CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

// Light Theme Colors (Default)
const kLightBg = Color(0xFFF8F9FA);
const kLightSurface = Color(0xFFFFFFFF);
const kLightSurface2 = Color(0xFFF1F3F5);
const kLightText = Color(0xFF212529);
const kLightMuted = Color(0xFF6C757D);
const kLightBorder = Color(0xFFDEE2E6);

// Dark Theme Colors
const kDarkBg = Color(0xFF0D1117);
const kDarkSurface = Color(0xFF161B22);
const kDarkSurface2 = Color(0xFF21262D);
const kDarkText = Color(0xFFC9D1D9);
const kDarkMuted = Color(0xFF8B949E);
const kDarkBorder = Color(0xFF30363D);

// Accent Colors (same for both themes)
const kGold = Color(0xFFF59E0B);
const kGoldLight = Color(0xFFFBBF24);
const kGreen = Color(0xFF10B981);
const kRed = Color(0xFFEF4444);
const kBlue = Color(0xFF3B82F6);
const kOrange = Color(0xFFF97316);

// Current theme colors (dynamically set)
Color kBg = kLightBg;
Color kSurface = kLightSurface;
Color kSurface2 = kLightSurface2;
Color kText = kLightText;
Color kMuted = kLightMuted;
Color kBorder = kLightBorder;

ThemeData buildTheme({bool isDark = false}) {
  // Update global color variables
  if (isDark) {
    kBg = kDarkBg;
    kSurface = kDarkSurface;
    kSurface2 = kDarkSurface2;
    kText = kDarkText;
    kMuted = kDarkMuted;
    kBorder = kDarkBorder;
  } else {
    kBg = kLightBg;
    kSurface = kLightSurface;
    kSurface2 = kLightSurface2;
    kText = kLightText;
    kMuted = kLightMuted;
    kBorder = kLightBorder;
  }

  return ThemeData(
    useMaterial3: true,
    brightness: isDark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: kBg,
    colorScheme: ColorScheme(
      brightness: isDark ? Brightness.dark : Brightness.light,
      primary: kGold,
      onPrimary: Colors.black,
      secondary: kGoldLight,
      onSecondary: Colors.black,
      error: kRed,
      onError: Colors.white,
      surface: kSurface,
      onSurface: kText,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: kSurface,
      foregroundColor: kText,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      iconTheme: IconThemeData(color: kMuted),
    ),
    cardColor: kSurface,
    dividerColor: kBorder,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kSurface2,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: kBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: kBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: kGold, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kGold,
        foregroundColor: Colors.black,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: kGold,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kSurface2,
      selectedColor: kGold.withOpacity(0.15),
      side: BorderSide(color: kBorder),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: kSurface,
      indicatorColor: kGold.withOpacity(0.15),
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return IconThemeData(color: kGold);
        return IconThemeData(color: kMuted);
      }),
    ),
    textTheme: TextTheme(
      bodyLarge: TextStyle(color: kText),
      bodyMedium: TextStyle(color: kText),
      bodySmall: TextStyle(color: kMuted),
      titleLarge: TextStyle(color: kText, fontWeight: FontWeight.w900),
      titleMedium: TextStyle(color: kText, fontWeight: FontWeight.w700),
      titleSmall: TextStyle(color: kMuted, fontWeight: FontWeight.w600),
    ),
  );
}
