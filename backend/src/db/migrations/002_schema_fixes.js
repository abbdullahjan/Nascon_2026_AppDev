'use strict';

/**
 * Migration 002 — Schema fixes for NaSCon '26 spec compliance.
 *
 * Adds:
 *   1. product_variants.reserved column + CHECK constraints on stock/reserved
 *   2. UNIQUE(match_id, sequence) on match_events
 *   3. order_items table
 *   4. CHECK on orders.status
 *   5. CHECK on users.role
 *   6. Indexes on frequently-queried foreign keys
 *
 * Never edits migration 001.
 */

exports.up = async function (knex) {

  // 1. product_variants — add reserved, add CHECK constraints
  await knex.schema.alterTable('product_variants', (t) => {
    t.integer('reserved').notNullable().defaultTo(0);
  });
  // CHECK constraints via raw (knex alterTable doesn't support addChecks portably)
  await knex.raw('ALTER TABLE product_variants ADD CONSTRAINT chk_variants_stock_gte_0 CHECK (stock >= 0)');
  await knex.raw('ALTER TABLE product_variants ADD CONSTRAINT chk_variants_reserved_gte_0 CHECK (reserved >= 0)');

  // 2. match_events — UNIQUE(match_id, sequence)
  await knex.raw('ALTER TABLE match_events ADD CONSTRAINT uq_match_events_match_seq UNIQUE (match_id, sequence)');

  // 3. order_items table
  await knex.schema.createTable('order_items', (t) => {
    t.increments('id');
    t.string('order_id', 64).notNullable().references('order_id').inTable('orders').onDelete('CASCADE');
    t.string('variant_id', 64).notNullable().references('variant_id').inTable('product_variants');
    t.integer('quantity').notNullable().checkPositive();
    t.integer('unit_price_minor').notNullable();
    t.timestamps(true, true);
  });

  // 4. orders.status CHECK
  await knex.raw(`
    ALTER TABLE orders
    ADD CONSTRAINT chk_orders_status CHECK (
      status IN ('pending','paid','packed','shipped','delivered','cancelled','refunded')
    )
  `);

  // 5. users.role CHECK
  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_role CHECK (
      role IN ('super_admin','league_organizer','club_manager','player','viewer')
    )
  `);

  // 6. Indexes on foreign keys that migration 001 didn't cover
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_leagues_tenant_id          ON leagues            (tenant_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_clubs_tenant_id            ON clubs              (tenant_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_matches_league_id          ON matches            (league_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants   (product_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_player_regs_player_id      ON player_registrations (player_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_roster_audit_player_id     ON roster_audit       (player_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_orders_customer_id         ON orders             (customer_id)');
};

exports.down = async function (knex) {
  // Indexes
  await knex.raw('DROP INDEX IF EXISTS idx_orders_customer_id');
  await knex.raw('DROP INDEX IF EXISTS idx_roster_audit_player_id');
  await knex.raw('DROP INDEX IF EXISTS idx_player_regs_player_id');
  await knex.raw('DROP INDEX IF EXISTS idx_product_variants_product_id');
  await knex.raw('DROP INDEX IF EXISTS idx_matches_league_id');
  await knex.raw('DROP INDEX IF EXISTS idx_clubs_tenant_id');
  await knex.raw('DROP INDEX IF EXISTS idx_leagues_tenant_id');

  // Constraints and table
  await knex.schema.dropTableIfExists('order_items');
  await knex.raw('ALTER TABLE users         DROP CONSTRAINT IF EXISTS chk_users_role');
  await knex.raw('ALTER TABLE orders        DROP CONSTRAINT IF EXISTS chk_orders_status');
  await knex.raw('ALTER TABLE match_events  DROP CONSTRAINT IF EXISTS uq_match_events_match_seq');
  await knex.raw('ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS chk_variants_reserved_gte_0');
  await knex.raw('ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS chk_variants_stock_gte_0');
  await knex.schema.alterTable('product_variants', (t) => {
    t.dropColumn('reserved');
  });
};
