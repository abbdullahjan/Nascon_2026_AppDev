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

    // 2. Seed baseline data
    console.log('Seeding baseline data...');
    const resetService = require('./services/resetService');
    await resetService.reset({ seed: 42, stock: { 'var-jersey-001-M': 1, 'var-jersey-001-L': 5 } });
    console.log('Baseline seed complete.');

    // 3. Start the HTTP server
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`NaSCon '26 API running on port ${PORT}`);
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
};

start();
