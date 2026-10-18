import 'package:flutter/material.dart';
import '../theme.dart';

/// Screen displayed when an unprivileged role attempts to access a forbidden route.
class NoPermissionScreen extends StatelessWidget {
  const NoPermissionScreen({super.key, this.resourceName});

  final String? resourceName;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Access Denied'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.error.withValues(alpha: 0.4)),
                ),
                child: const Icon(
                  Icons.lock_person_rounded,
                  color: AppColors.error,
                  size: 36,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                "You don't have permission to view this",
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                resourceName != null
                    ? 'Your current role does not have access permissions for "$resourceName".'
                    : 'Your current account role does not have authorization to access this area.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textSecondary,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                icon: const Icon(Icons.arrow_back_rounded, size: 18),
                label: const Text('Go Back'),
                onPressed: () {
                  if (Navigator.canPop(context)) {
                    Navigator.pop(context);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
