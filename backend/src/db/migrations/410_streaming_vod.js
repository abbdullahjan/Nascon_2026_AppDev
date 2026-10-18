'use strict';

/**
 * Migration 410 — vod_recordings table.
 * Owner: Ahmed (Person B) — streaming module prefix 410.
 *
 * Stores VOD metadata after a live stream ends and the recording is
 * uploaded to RustFS (S3-compatible object storage).
 *
 * Fields:
 *   recording_id  — UUID primary key
 *   stream_key    — the stream key that produced this recording
 *   player_id     — who streamed
 *   s3_bucket     — RustFS bucket name (from S3_BUCKET env)
 *   s3_key        — object key inside the bucket
 *   vod_url       — public playback URL
 *   duration_sec  — stream duration in seconds (nullable — set when known)
 *   file_size_bytes — recording file size (nullable)
 *   status        — 'pending' | 'uploaded' | 'failed'
 *   recorded_at   — when the stream ended (UTC)
 */

exports.up = async function (knex) {
  await knex.schema.createTable('vod_recordings', (t) => {
    t.string('recording_id', 64).primary();
    t.string('stream_key', 64).notNullable();
    t.string('player_id', 64).notNullable();
    t.string('s3_bucket', 128).notNullable();
    t.string('s3_key', 512).notNullable().unique();
    t.text('vod_url').notNullable();
    t.integer('duration_sec').nullable();
    t.bigInteger('file_size_bytes').nullable();
    // status: pending (upload queued) | uploaded | failed
    t.string('status', 10).notNullable().defaultTo('pending');
    t.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);

    t.index('stream_key');
    t.index('player_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('vod_recordings');
};
