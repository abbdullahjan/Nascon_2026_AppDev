'use strict';

const db     = require('../config/db');
const bcrypt = require('bcryptjs');

// Baseline sport definitions — stored as data, never hard-coded in logic
const BASELINE_SPORTS = [
  {
    sport_id: 'football',
    name: 'Football',
    scoring_model: 'event',
    periods: { count: 2, duration_minutes: 45 },
    scoring_events: { goal: { points: 1 } },
    draw_allowed: true,
    overtime: { policy: 'none' },
    tie_break_order: ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'],
    roster: { min_squad_size: 11, max_squad_size: 25, required_positions: { gk: 1 } },
  },
  {
    sport_id: 'basketball',
    name: 'Basketball',
    scoring_model: 'event',
    periods: { count: 4, duration_minutes: 12 },
    scoring_events: {
      free_throw:    { points: 1 },
      two_pointer:   { points: 2 },
      three_pointer: { points: 3 },
    },
    draw_allowed: false,
    overtime: { policy: 'extra_time', duration_minutes: 5 },
    tie_break_order: ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'],
    roster: { min_squad_size: 5, max_squad_size: 15, required_positions: {} },
  },
  {
    sport_id: 'cricket',
    name: 'Cricket',
    scoring_model: 'innings',
    periods: { innings_per_team: 1, overs_per_innings: 20, balls_per_over: 6, wickets_per_innings: 10 },
    scoring_events: {
      dot_ball: { runs: 0, legal_ball: true,  wicket: false },
      single:   { runs: 1, legal_ball: true,  wicket: false },
      two:      { runs: 2, legal_ball: true,  wicket: false },
      four:     { runs: 4, legal_ball: true,  wicket: false },
      six:      { runs: 6, legal_ball: true,  wicket: false },
      wide:     { runs: 1, legal_ball: false, wicket: false },
      no_ball:  { runs: 1, legal_ball: false, wicket: false },
      wicket:   { runs: 0, legal_ball: true,  wicket: true  },
    },
    draw_allowed: true,
    overtime: { policy: 'super_over' },
    tie_break_order: ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'],
    roster: { min_squad_size: 11, max_squad_size: 18, required_positions: { wicketkeeper: 1 } },
  },
  {
    sport_id: 'esports',
    name: 'Esports',
    scoring_model: 'round',
    periods: { best_of: 3 },
    scoring_events: { round_win: { rounds: 1 } },
    draw_allowed: false,
    overtime: { policy: 'none' },
    tie_break_order: ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'],
    roster: { min_squad_size: 5, max_squad_size: 8, required_positions: {} },
  },
];

const DEMO_USERS = [
  { user_id: 'user-super-admin',      email: 'admin@nascon.test',     password: 'Nascon@26', role: 'super_admin',      tenant_id: null,           owned_id: null },
  { user_id: 'user-organizer',        email: 'organizer@nascon.test', password: 'Nascon@26', role: 'league_organizer', tenant_id: 'tenant-alpha', owned_id: 'league-alpha-1' },
  { user_id: 'user-club-manager',     email: 'manager@nascon.test',   password: 'Nascon@26', role: 'club_manager',     tenant_id: 'tenant-alpha', owned_id: 'club-alpha-1' },
  { user_id: 'user-player',           email: 'player@nascon.test',    password: 'Nascon@26', role: 'player',           tenant_id: 'tenant-alpha', owned_id: 'player-alpha-1' },
  { user_id: 'user-viewer',           email: 'viewer@nascon.test',    password: 'Nascon@26', role: 'viewer',           tenant_id: 'tenant-alpha', owned_id: null },
];

/**
 * Wipe all state and re-seed baseline data.
 * Must be repeatable and leave identical state every time.
 */
async function reset({ seed = 42, stock = { 'var-jersey-001-M': 1, 'var-jersey-001-L': 5 } }) {
  await db.transaction(async (trx) => {
    // Wipe all tables in dependency order (exact tables from migration)
    await trx.raw(`
      TRUNCATE TABLE
        offline_sync_results, offline_sync_requests,
        orders,
        product_variants, products,
        roster_audit, player_registrations, players, squads,
        roster_live_matches, roster_leagues,
        match_events, matches,
        leagues,
        sports,
        discount_codes,
        users,
        clubs, tenants,
        app_config
      RESTART IDENTITY CASCADE
    `);

    // Seed tenants
    await trx('tenants').insert([
      { tenant_id: 'tenant-alpha', name: 'Alpha Sports' },
      { tenant_id: 'tenant-beta',  name: 'Beta Athletics' },
    ]);

    // Seed sports
    for (const sport of BASELINE_SPORTS) {
      await trx('sports').insert({
        sport_id:      sport.sport_id,
        name:          sport.name,
        scoring_model: sport.scoring_model,
        config:        JSON.stringify(sport),
      });
    }

    // Seed clubs
    await trx('clubs').insert([
      { club_id: 'club-alpha-1', tenant_id: 'tenant-alpha', name: 'Alpha Club 1' },
      { club_id: 'club-alpha-2', tenant_id: 'tenant-alpha', name: 'Alpha Club 2' },
      { club_id: 'club-beta-1',  tenant_id: 'tenant-beta',  name: 'Beta Club 1'  },
    ]);

    // Seed leagues
    await trx('leagues').insert([
      { league_id: 'league-alpha-1', tenant_id: 'tenant-alpha', sport_id: 'football', config: JSON.stringify({}) },
      { league_id: 'league-alpha-2', tenant_id: 'tenant-alpha', sport_id: 'football', config: JSON.stringify({}) },
      { league_id: 'league-beta-1',  tenant_id: 'tenant-beta',  sport_id: 'football', config: JSON.stringify({}) },
    ]);

    // Seed demo users with bcrypt-hashed passwords
    for (const user of DEMO_USERS) {
      const hash = await bcrypt.hash(user.password, 10);
      await trx('users').insert({
        user_id:   user.user_id,
        email:     user.email,
        password:  hash,
        role:      user.role,
        tenant_id: user.tenant_id,
        owned_id:  user.owned_id,
      });
    }

    // Seed players
    await trx('players').insert([
      { player_id: 'player-alpha-1', name: 'Player Alpha 1', tenant_id: 'tenant-alpha', club_id: 'club-alpha-1' },
      { player_id: 'player-alpha-2', name: 'Player Alpha 2', tenant_id: 'tenant-alpha', club_id: 'club-alpha-2' },
      { player_id: 'player-beta-1',  name: 'Player Beta 1',  tenant_id: 'tenant-beta',  club_id: 'club-beta-1'  },
    ]);

    // Seed store products and variants
    await trx('products').insert([
      { product_id: 'prod-jersey-001', tenant_id: 'tenant-alpha', name: 'NaSCon Jersey' },
    ]);
    await trx('product_variants').insert([
      { variant_id: 'var-jersey-001-M', product_id: 'prod-jersey-001', sku: 'JERSEY-M', size: 'M', price_minor: 450000, currency: 'PKR', stock: stock['var-jersey-001-M'] ?? 1 },
      { variant_id: 'var-jersey-001-L', product_id: 'prod-jersey-001', sku: 'JERSEY-L', size: 'L', price_minor: 450000, currency: 'PKR', stock: stock['var-jersey-001-L'] ?? 5 },
    ]);

    // Seed discount codes
    await trx('discount_codes').insert([
      { code: 'WELCOME10', discount_type: 'percent', discount_value: 10, tenant_id: 'tenant-alpha' },
    ]);

    // Store the current seed for draw_lots
    await trx.raw(`
      INSERT INTO app_config (key, value) VALUES ('lots_seed', ?)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [String(seed)]);
  });

  return {
    status:  'reset_complete',
    seed,
    sports:  BASELINE_SPORTS.map(s => s.sport_id),
    tenants: ['tenant-alpha', 'tenant-beta'],
    stock,
  };
}

module.exports = { reset };
