'use strict';

// All environment variables in one place.
// Read DAY1_SALT only from the environment — never hard-coded.
module.exports = {
  PORT:          process.env.PORT          || 8080,
  NODE_ENV:      process.env.NODE_ENV      || 'development',
  DAY1_SALT:     process.env.DAY1_SALT,           // required — injected by docker-compose
  DATABASE_URL:  process.env.DATABASE_URL,
  REDIS_URL:     process.env.REDIS_URL     || 'redis://localhost:6379',
  JWT_SECRET:    process.env.JWT_SECRET    || 'dev-secret-change-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',
};
