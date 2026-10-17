'use strict';

require('dotenv').config();

const db  = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 8080;

const start = async () => {
  try {
    // 1. Run DB migrations (creates all tables if they don't exist)
    console.log('Running migrations...');
    await db.migrate.latest();
    console.log('Migrations complete.');

    // 2. Seed baseline data only if the database is empty (first boot on a
    //    clean volume). POST /audit/v1/reset handles explicit re-seeding.
    const userCount = await db('users').count('* as cnt').first();
    if (parseInt(userCount.cnt) === 0) {
      console.log('Empty database detected — seeding baseline data...');
      const resetService = require('./services/resetService');
      await resetService.reset({ seed: 42, stock: { 'var-jersey-001-M': 1, 'var-jersey-001-L': 5 } });
      console.log('Baseline seed complete.');
    } else {
      console.log('Database already seeded — skipping auto-seed.');
    }

    // 3. Start the HTTP server
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`NaSCon '26 API running on port ${PORT}`);
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
};

start();
