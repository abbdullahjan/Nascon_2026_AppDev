'use strict';

// This file runs migrations and then calls /reset to seed baseline data.
// Invoked automatically on container startup before the API is ready.

const db          = require('../config/db');
const resetService = require('../services/resetService');

async function runMigrationsAndSeed() {
  console.log('Running database migrations...');
  await db.migrate.latest();
  console.log('Migrations complete.');

  console.log('Seeding baseline data...');
  await resetService.reset({ seed: 42, stock: { 'var-jersey-001-M': 1, 'var-jersey-001-L': 5 } });
  console.log('Baseline seed complete.');
}

runMigrationsAndSeed()
  .then(() => { console.log('DB ready.'); process.exit(0); })
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
