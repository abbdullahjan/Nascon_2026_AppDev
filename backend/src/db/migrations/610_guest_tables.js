'use strict';

/**
 * Migration 610 — Guest module ownership marker.
 * Prefix 610–619 per CONVENTIONS.md (Person A, guest_* / persistent_carts_*).
 *
 * Core tables (guest_tokens, guest_carts, persistent_carts) were created in
 * migration 100 (Phase II baseline). This migration adds:
 *   1. merge_payload_hash column on guest_tokens for idempotency (replay detection).
 *   2. Index on persistent_carts(user_id) if not already present.
 *
 * Owner: Person A (guest module)
 */

exports.up = async function (knex) {
  const hasTokens = await knex.schema.hasTable('guest_tokens');
  if (!hasTokens) return; // guard: baseline migration must run first

  // Add merge_payload_hash if not present (may already exist from migration 100
  // as merged_payload_hash — we use the same column name for compatibility).
  const hasMergedHash = await knex.schema.hasColumn('guest_tokens', 'merged_payload_hash');
  if (!hasMergedHash) {
    await knex.schema.alterTable('guest_tokens', (t) => {
      t.string('merged_payload_hash', 64).nullable();
    });
  }

  // Ensure index on persistent_carts(user_id) for fast cart lookups
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_persistent_carts_user_id
    ON persistent_carts (user_id)
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_persistent_carts_user_id');
};
