'use strict';

exports.up = async function (knex) {

  // ── App config (key-value store for things like lots_seed) ─────────────────
  await knex.schema.createTable('app_config', (t) => {
    t.string('key', 64).primary();
    t.text('value').notNullable();
  });

  // ── Tenants ────────────────────────────────────────────────────────────────
  await knex.schema.createTable('tenants', (t) => {
    t.string('tenant_id', 64).primary();
    t.string('name', 120).notNullable();
    t.timestamps(true, true);
  });

  // ── Sports (all config stored as JSON — no hard-coded sport logic) ─────────
  await knex.schema.createTable('sports', (t) => {
    t.string('sport_id', 64).primary();
    t.string('name', 80).notNullable();
    t.string('scoring_model', 20).notNullable(); // event | innings | round
    t.jsonb('config').notNullable();             // full sport config blob
    t.timestamps(true, true);
  });

  // ── Clubs ──────────────────────────────────────────────────────────────────
  await knex.schema.createTable('clubs', (t) => {
    t.string('club_id', 64).primary();
    t.string('tenant_id', 64).notNullable().references('tenant_id').inTable('tenants');
    t.string('name', 120).notNullable();
    t.jsonb('meta').defaultTo('{}');
    t.timestamps(true, true);
  });

  // ── Leagues ────────────────────────────────────────────────────────────────
  await knex.schema.createTable('leagues', (t) => {
    t.string('league_id', 64).primary();
    t.string('tenant_id', 64).nullable().references('tenant_id').inTable('tenants');
    t.string('sport_id', 64).notNullable().references('sport_id').inTable('sports');
    t.jsonb('config').notNullable().defaultTo('{}');
    t.timestamps(true, true);
  });

  // ── Matches ────────────────────────────────────────────────────────────────
  await knex.schema.createTable('matches', (t) => {
    t.string('match_id', 64).primary();
    t.string('league_id', 64).nullable().references('league_id').inTable('leagues');
    t.string('sport_id', 64).notNullable().references('sport_id').inTable('sports');
    t.string('home_team', 64).notNullable();
    t.string('away_team', 64).notNullable();
    t.string('status', 20).notNullable().defaultTo('upcoming');
    t.timestamps(true, true);
  });

  // ── Match events (append-only log) ─────────────────────────────────────────
  await knex.schema.createTable('match_events', (t) => {
    t.string('event_id', 64).primary();
    t.string('match_id', 64).notNullable().references('match_id').inTable('matches');
    t.string('type', 30).notNullable();
    t.integer('sequence').notNullable();
    t.jsonb('payload').notNullable().defaultTo('{}');
    t.string('signature', 64).notNullable();
    t.boolean('compensated').notNullable().defaultTo(false);
    t.string('compensated_by', 64).nullable();
    t.text('raw_body').nullable();
    t.text('response_body').nullable();
    t.timestamps(true, true);
  });

  // ── Users (demo accounts + RBAC) ───────────────────────────────────────────
  await knex.schema.createTable('users', (t) => {
    t.string('user_id', 64).primary();
    t.string('email', 120).notNullable().unique();
    t.string('password', 120).notNullable();
    t.string('role', 30).notNullable();
    t.string('tenant_id', 64).nullable();
    t.string('owned_id', 64).nullable();
    t.timestamps(true, true);
  });

  // ── Products & variants ────────────────────────────────────────────────────
  await knex.schema.createTable('products', (t) => {
    t.string('product_id', 64).primary();
    t.string('tenant_id', 64).notNullable().references('tenant_id').inTable('tenants');
    t.string('name', 120).notNullable();
    t.jsonb('meta').defaultTo('{}');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('product_variants', (t) => {
    t.string('variant_id', 64).primary();
    t.string('product_id', 64).notNullable().references('product_id').inTable('products');
    t.string('sku', 64).nullable();
    t.string('size', 20).nullable();
    t.string('color', 30).nullable();
    t.integer('price_minor').notNullable();
    t.string('currency', 3).notNullable().defaultTo('PKR');
    t.integer('stock').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  // ── Discount codes ─────────────────────────────────────────────────────────
  await knex.schema.createTable('discount_codes', (t) => {
    t.increments('id');
    t.string('code', 64).notNullable().unique();
    t.string('discount_type', 20).notNullable().defaultTo('percent');
    t.integer('discount_value').notNullable();
    t.string('tenant_id', 64).nullable();
    t.timestamps(true, true);
  });

  // ── Orders ─────────────────────────────────────────────────────────────────
  await knex.schema.createTable('orders', (t) => {
    t.string('order_id', 64).primary();
    t.string('customer_id', 64).notNullable();
    t.string('status', 20).notNullable().defaultTo('pending');
    t.integer('subtotal_minor').notNullable();
    t.integer('discount_minor').notNullable().defaultTo(0);
    t.integer('total_minor').notNullable();
    t.string('currency', 3).notNullable().defaultTo('PKR');
    t.text('raw_body').nullable();
    t.text('response_body').nullable();
    t.timestamps(true, true);
  });

  // ── Roster leagues config ──────────────────────────────────────────────────
  await knex.schema.createTable('roster_leagues', (t) => {
    t.string('league_id', 64).primary();
    t.string('tenant_id', 64).nullable();
    t.string('sport_id', 64).nullable();
    t.date('transfer_window_open').nullable();
    t.date('transfer_window_close').nullable();
    t.integer('max_squad_size').nullable();
    t.jsonb('required_positions').defaultTo('{}');
    t.jsonb('config').defaultTo('{}');
    t.timestamps(true, true);
  });

  // ── Squads ─────────────────────────────────────────────────────────────────
  await knex.schema.createTable('squads', (t) => {
    t.string('squad_id', 64).primary();
    t.string('league_id', 64).notNullable();
    t.string('club_id', 64).nullable();
    t.string('tenant_id', 64).nullable();
    t.string('name', 120).nullable();
    t.timestamps(true, true);
  });

  // ── Players ────────────────────────────────────────────────────────────────
  await knex.schema.createTable('players', (t) => {
    t.string('player_id', 64).primary();
    t.string('name', 120).notNullable();
    t.string('tenant_id', 64).nullable();
    t.string('club_id', 64).nullable();
    t.timestamps(true, true);
  });

  // ── Player registrations ───────────────────────────────────────────────────
  await knex.schema.createTable('player_registrations', (t) => {
    t.increments('id');
    t.string('player_id', 64).notNullable().references('player_id').inTable('players');
    t.string('league_id', 64).notNullable();
    t.string('squad_id', 64).nullable();
    t.string('parent_squad_id', 64).nullable();
    t.string('registration_type', 20).notNullable().defaultTo('transfer');
    t.date('start_date').nullable();
    t.date('loan_end_date').nullable();
    t.string('role', 20).notNullable().defaultTo('starter');
    t.string('position', 30).nullable();
    t.timestamps(true, true);
  });

  // ── Roster audit trail (immutable, append-only) ────────────────────────────
  await knex.schema.createTable('roster_audit', (t) => {
    t.increments('id');
    t.string('request_id', 64).notNullable().unique();
    t.string('audit_id', 64).notNullable();
    t.string('player_id', 64).notNullable();
    t.string('league_id', 64).notNullable();
    t.string('action', 20).notNullable();
    t.string('from_squad_id', 64).nullable();
    t.string('to_squad_id', 64).nullable();
    t.date('effective_date').nullable();
    t.string('state', 30).nullable();
    t.string('who', 64).nullable();
    t.string('why', 255).nullable();
    t.text('raw_body').nullable();
    t.text('response_body').nullable();
    t.timestamps(true, true);
  });

  // ── Live matches for roster (in-progress match tracking) ──────────────────
  await knex.schema.createTable('roster_live_matches', (t) => {
    t.string('match_id', 64).primary();
    t.string('league_id', 64).nullable();
    t.string('home_squad_id', 64).nullable();
    t.string('away_squad_id', 64).nullable();
    t.timestamps(true, true);
  });

  // ── Offline sync ───────────────────────────────────────────────────────────
  await knex.schema.createTable('offline_sync_requests', (t) => {
    t.increments('id');
    t.string('request_key', 255).notNullable().unique();
    t.string('device_id', 64).notNullable();
    t.text('response_body').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('offline_sync_results', (t) => {
    t.increments('id');
    t.string('device_id', 64).notNullable();
    t.string('action_id', 64).notNullable();
    t.string('status', 20).nullable();
    t.string('resolution', 30).nullable();
    t.string('error_code', 64).nullable();
    t.integer('server_version').nullable();
    t.unique(['device_id', 'action_id']);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  const tables = [
    'offline_sync_results','offline_sync_requests',
    'roster_live_matches','roster_audit','player_registrations',
    'players','squads','roster_leagues',
    'orders','discount_codes','product_variants','products',
    'users','match_events','matches','leagues','clubs','sports','tenants','app_config',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};
