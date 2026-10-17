'use strict';

const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: require('path').join(__dirname, '../db/migrations'),
    tableName:  'knex_migrations',
  },
});

module.exports = db;
