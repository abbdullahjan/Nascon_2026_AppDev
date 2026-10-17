'use strict';

const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './src/db/migrations',
    tableName:  'knex_migrations',
  },
});

module.exports = db;
