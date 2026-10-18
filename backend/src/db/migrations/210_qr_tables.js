'use strict';

/**
 * Migration 210 — QR module ownership marker.
 *
 * The core qr_mappings and qr_scan_events tables were created in migration 100
 * (Phase II baseline). This migration is the QR module's own prefix slot
 * (210–219 per CONVENTIONS.md) and adds a performance index on short_code
 * lookups (the redirect path /q/:short_code is called on every QR scan).
 *
 * Owner: Person A (qr module)
 */

exports.up = async function (knex) {
  // Add a covering index on short_code for fast O(1) redirect lookups.
  // short_code already has a UNIQUE constraint from migration 100 (which
  // implicitly creates an index), but we name it explicitly here so it
  // can be dropped cleanly in exports.down without touching the constraint.
  const exists = await knex.schema.hasTable('qr_mappings');
  if (!exists) return; // guard: baseline migration must run first

  // Add target_route column if it doesn't exist yet — stores cached route per entity
  const hasTargetRoute = await knex.schema.hasColumn('qr_mappings', 'target_route');
  if (!hasTargetRoute) {
    await knex.schema.alterTable('qr_mappings', (t) => {
      t.string('target_route', 512).nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasTargetRoute = await knex.schema.hasColumn('qr_mappings', 'target_route');
  if (hasTargetRoute) {
    await knex.schema.alterTable('qr_mappings', (t) => {
      t.dropColumn('target_route');
    });
  }
};
