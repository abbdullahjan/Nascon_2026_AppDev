'use strict';

/**
 * Centralised environment-variable config for Phase I + Phase II.
 *
 * Rules:
 *   - DAY1_SALT and DAY2_SALT come ONLY from env vars — never hard-coded here.
 *   - Object storage is RustFS (S3-compatible) via AWS S3 SDK; env vars below.
 *   - All media server ports are fixed per spec 6.1 — do not change them.
 */
module.exports = {
  // Server
  PORT:     parseInt(process.env.PORT || '8080', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Phase I competition salt
  DAY1_SALT: process.env.DAY1_SALT,

  // Phase II competition salt — MUST come from env, never committed
  DAY2_SALT: process.env.DAY2_SALT,

  // Database
  DATABASE_URL: process.env.DATABASE_URL,

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  JWT_SECRET:    process.env.JWT_SECRET    || 'dev-secret-change-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',

  // RustFS (S3-compatible object storage) — used for VOD recordings + QR PDFs
  S3_ENDPOINT:   process.env.S3_ENDPOINT,
  S3_BUCKET:     process.env.S3_BUCKET     || 'nascon',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  S3_REGION:     process.env.S3_REGION     || 'us-east-1', // RustFS accepts any region string

  // Media server fixed ports (spec 6.1 — do not change)
  MEDIA_RTMP_PORT:   parseInt(process.env.MEDIA_RTMP_PORT   || '1935', 10),
  MEDIA_HLS_PORT:    parseInt(process.env.MEDIA_HLS_PORT    || '8888', 10),
  MEDIA_WEBRTC_PORT: parseInt(process.env.MEDIA_WEBRTC_PORT || '8889', 10),
  MEDIA_HOST:        process.env.MEDIA_HOST || 'localhost',

  // Guest token prefix (constant — used by guard middleware)
  GUEST_TOKEN_PREFIX: 'guest_anon_tok_',
};
