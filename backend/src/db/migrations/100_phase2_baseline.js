'use strict';

/**
 * Migration 100 — Phase II baseline tables.
 *
 * Prefix 100 reserves 101–109 for Phase II sub-module fixes.
 * Per-module prefixes: 210 qr_*, 310 moderation_*, 410 streaming_*,
 *                      510 costream_*, 610 guest_*, 710 realtime_*.
 *
 * Tables created here:
 *   qr_mappings        — dynamic QR entity registry
 *   qr_scan_events     — privacy-safe scan telemetry (no IP, no PII)
 *   guest_tokens       — short-lived anonymous viewer tokens
 *   guest_carts        — staged cart items for unregistered guests
 *   persistent_carts   — registered-user cart (empty list for player-alpha-1)
 *   stream_keys        — creator RTMP/WebRTC stream key lifecycle
 *   costream_sessions  — 4-way co-stream session state
 *   moderation_dlq     — failed notification dead-letter queue
 */

exports.up = async function (knex) {

  // ── QR mappings ────────────────────────────────────────────────────────────
  await knex.schema.createTable('qr_mappings', (t) => {
    t.string('entity_id', 64).primary();
    // entity_type: match | player | club | costream
    t.string('entity_type', 20).notNullable();
    t.string('short_code', 64).notNullable().unique();
    t.string('short_url', 255).notNullable();
    t.integer('scan_count').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  // ── QR scan telemetry — no IP, no full UA, no PII ─────────────────────────
  await knex.schema.createTable('qr_scan_events', (t) => {
    t.increments('id');
    t.string('entity_id', 64).notNullable().references('entity_id').inTable('qr_mappings');
    // device_family: 'mobile' | 'desktop' — derived from UA, not stored raw
    t.string('device_family', 10).notNullable().defaultTo('unknown');
    // scanned_at stored as UTC minute bucket (truncated to minute) — NFR-9
    t.bigInteger('scanned_at_minute').notNullable();
    t.index('entity_id');
  });

  // ── Guest tokens ───────────────────────────────────────────────────────────
  await knex.schema.createTable('guest_tokens', (t) => {
    t.string('token', 128).primary();
    // merged: true once the guest cart has been atomically merged
    t.boolean('merged').notNullable().defaultTo(false);
    // merged_into_user_id: set when merged, used for idempotency check
    t.string('merged_into_user_id', 64).nullable();
    // merged_payload_hash: SHA-256 of canonical(guest_cart) at merge time
    t.string('merged_payload_hash', 64).nullable();
    t.timestamps(true, true);
  });

  // ── Guest staged carts ─────────────────────────────────────────────────────
  await knex.schema.createTable('guest_carts', (t) => {
    t.increments('id');
    t.string('guest_token', 128).notNullable().references('token').inTable('guest_tokens').onDelete('CASCADE');
    t.string('variant_id', 64).notNullable().references('variant_id').inTable('product_variants');
    t.integer('quantity').notNullable().checkPositive();
    t.unique(['guest_token', 'variant_id']);
    t.timestamps(true, true);
  });

  // ── Persistent member carts ────────────────────────────────────────────────
  await knex.schema.createTable('persistent_carts', (t) => {
    t.increments('id');
    // user_id references players table (player_id is the user identity in Phase I)
    t.string('user_id', 64).notNullable();
    t.string('variant_id', 64).notNullable().references('variant_id').inTable('product_variants');
    t.integer('quantity').notNullable().checkPositive();
    t.unique(['user_id', 'variant_id']);
    t.timestamps(true, true);
    t.index('user_id');
  });

  // ── Stream keys ────────────────────────────────────────────────────────────
  await knex.schema.createTable('stream_keys', (t) => {
    t.string('stream_key', 64).primary();
    t.string('player_id', 64).notNullable().references('player_id').inTable('players');
    t.string('label', 64).notNullable().defaultTo('default');
    // status: active | revoked
    t.string('status', 10).notNullable().defaultTo('active');
    t.timestamps(true, true);
    t.index('player_id');
  });

  // ── Co-stream sessions ─────────────────────────────────────────────────────
  await knex.schema.createTable('costream_sessions', (t) => {
    t.string('session_id', 64).primary();
    // status: active | terminated
    t.string('status', 12).notNullable().defaultTo('active');
    t.string('active_host', 64).nullable();
    t.boolean('handoff_occurred').notNullable().defaultTo(false);
    t.integer('participant_count').notNullable().defaultTo(0);
    // JSON array of active participant player IDs
    t.jsonb('active_participants').notNullable().defaultTo('[]');
    // layout: solo | grid_2 | grid_4 | spotlight
    t.string('layout', 12).notNullable().defaultTo('grid_4');
    // Store request fingerprint for idempotency (hash of canonical request)
    t.string('request_hash', 64).nullable();
    t.timestamps(true, true);
  });

  // ── Moderation Dead-Letter Queue ──────────────────────────────────────────
  await knex.schema.createTable('moderation_dlq', (t) => {
    t.increments('id');
    t.string('chat_room_id', 128).notNullable();
    t.jsonb('event_payload').notNullable().defaultTo('{}');
    t.integer('attempt_count').notNullable().defaultTo(0);
    // status: pending | failed
    t.string('status', 10).notNullable().defaultTo('pending');
    t.timestamps(true, true);
    t.index('chat_room_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('moderation_dlq');
  await knex.schema.dropTableIfExists('costream_sessions');
  await knex.schema.dropTableIfExists('stream_keys');
  await knex.schema.dropTableIfExists('persistent_carts');
  await knex.schema.dropTableIfExists('guest_carts');
  await knex.schema.dropTableIfExists('guest_tokens');
  await knex.schema.dropTableIfExists('qr_scan_events');
  await knex.schema.dropTableIfExists('qr_mappings');
};
