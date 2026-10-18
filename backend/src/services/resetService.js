'use strict';

const db           = require('../config/db');
const bcrypt       = require('bcryptjs');
const { resetAll, seedAll } = require('../modules');

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
    // Wipe all tables in dependency order.
    // Phase II tables listed first (they reference Phase I tables).
    // Migrations 001 + 002 (Phase I) + 100 (Phase II baseline).
    await trx.raw(`
      TRUNCATE TABLE
        moderation_dlq,
        costream_sessions,
        stream_keys,
        persistent_carts,
        guest_carts,
        guest_tokens,
        qr_scan_events,
        qr_mappings,
        offline_sync_results, offline_sync_requests,
        order_items, orders,
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

    // Seed clubs with rich metadata (venue, branding)
    await trx('clubs').insert([
      {
        club_id:   'club-alpha-1',
        tenant_id: 'tenant-alpha',
        name:      'Alpha Club 1',
        meta:      JSON.stringify({ venue: 'Jinnah Sports Complex, Islamabad', city: 'Islamabad', primary_color: '#1E3A8A', secondary_color: '#F59E0B' }),
      },
      {
        club_id:   'club-alpha-2',
        tenant_id: 'tenant-alpha',
        name:      'Alpha Club 2',
        meta:      JSON.stringify({ venue: 'Ayub National Stadium, Rawalpindi', city: 'Rawalpindi', primary_color: '#DC2626', secondary_color: '#FFFFFF' }),
      },
      {
        club_id:   'club-beta-1',
        tenant_id: 'tenant-beta',
        name:      'Beta Club 1',
        meta:      JSON.stringify({ venue: 'Gaddafi Stadium, Lahore', city: 'Lahore', primary_color: '#059669', secondary_color: '#10B981' }),
      },
    ]);

    // Seed leagues with team configuration
    const leagueAlphaConfig = {
      sport_id:        'football',
      teams:           ['club-alpha-1', 'club-alpha-2'],
      points:          { win: 3, draw: 1, loss: 0 },
      tie_break_order: ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'],
      qualification:   { spots: 1 },
      lots_seed:       seed,
    };

    await trx('leagues').insert([
      { league_id: 'league-alpha-1', tenant_id: 'tenant-alpha', sport_id: 'football', config: JSON.stringify(leagueAlphaConfig) },
      { league_id: 'league-alpha-2', tenant_id: 'tenant-alpha', sport_id: 'football', config: JSON.stringify({ ...leagueAlphaConfig, teams: [] }) },
      { league_id: 'league-beta-1',  tenant_id: 'tenant-beta',  sport_id: 'football', config: JSON.stringify({ ...leagueAlphaConfig, teams: ['club-beta-1'] }) },
    ]);

    // Seed sample matches
    await trx('matches').insert([
      { match_id: 'match-alpha-1', league_id: 'league-alpha-1', sport_id: 'football', home_team: 'club-alpha-1', away_team: 'club-alpha-2', status: 'in_progress' },
      { match_id: 'match-alpha-2', league_id: 'league-alpha-1', sport_id: 'football', home_team: 'club-alpha-2', away_team: 'club-alpha-1', status: 'upcoming' },
      { match_id: 'match-beta-1',  league_id: 'league-beta-1',  sport_id: 'football', home_team: 'club-beta-1',  away_team: 'club-alpha-1', status: 'completed' },
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

    // Seed squads
    await trx('squads').insert([
      { squad_id: 'squad-alpha-1', league_id: 'league-alpha-1', club_id: 'club-alpha-1', tenant_id: 'tenant-alpha', name: 'Alpha 1 First Team' },
      { squad_id: 'squad-alpha-2', league_id: 'league-alpha-1', club_id: 'club-alpha-2', tenant_id: 'tenant-alpha', name: 'Alpha 2 First Team' },
      { squad_id: 'squad-beta-1',  league_id: 'league-beta-1',  club_id: 'club-beta-1',  tenant_id: 'tenant-beta',  name: 'Beta 1 First Team' },
    ]);

    // Seed players
    await trx('players').insert([
      { player_id: 'player-alpha-1', name: 'Player Alpha 1', tenant_id: 'tenant-alpha', club_id: 'club-alpha-1' },
      { player_id: 'player-alpha-2', name: 'Player Alpha 2', tenant_id: 'tenant-alpha', club_id: 'club-alpha-2' },
      { player_id: 'player-beta-1',  name: 'Player Beta 1',  tenant_id: 'tenant-beta',  club_id: 'club-beta-1'  },
    ]);

    // Seed player registrations
    const today = new Date().toISOString().slice(0, 10);
    await trx('player_registrations').insert([
      { player_id: 'player-alpha-1', league_id: 'league-alpha-1', squad_id: 'squad-alpha-1', registration_type: 'transfer', start_date: today, role: 'captain', position: 'Forward' },
      { player_id: 'player-alpha-2', league_id: 'league-alpha-1', squad_id: 'squad-alpha-2', registration_type: 'transfer', start_date: today, role: 'starter', position: 'Goalkeeper' },
      { player_id: 'player-beta-1',  league_id: 'league-beta-1',  squad_id: 'squad-beta-1',  registration_type: 'transfer', start_date: today, role: 'starter', position: 'Midfielder' },
    ]);

    // Seed store products and variants
    await trx('products').insert([
      {
        product_id: 'prod-jersey-001',
        tenant_id:  'tenant-alpha',
        name:       'NaSCon Jersey',
        meta:       JSON.stringify({ category: 'Apparel', description: 'Official 2026 Season Performance Jersey' }),
      },
    ]);
    await trx('product_variants').insert([
      { variant_id: 'var-jersey-001-M', product_id: 'prod-jersey-001', sku: 'JERSEY-M', size: 'M', color: 'Navy Blue', price_minor: 450000, currency: 'PKR', stock: stock['var-jersey-001-M'] ?? 1 },
      { variant_id: 'var-jersey-001-L', product_id: 'prod-jersey-001', sku: 'JERSEY-L', size: 'L', color: 'Navy Blue', price_minor: 450000, currency: 'PKR', stock: stock['var-jersey-001-L'] ?? 5 },
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

    // ── Phase II: module reset hooks ────────────────────────────────────────
    // Each module truncates its own tables here (no-ops until tables exist).
    await resetAll(trx);

    // ── Phase II: baseline seed data (spec 5.2) ─────────────────────────────

    // 1. player-beta-2 in club-beta-1 (spec 5.2 — must exist after reset)
    await trx('players').insert({
      player_id: 'player-beta-2',
      name:      'Player Beta 2',
      tenant_id: 'tenant-beta',
      club_id:   'club-beta-1',
    });
    await trx('player_registrations').insert({
      player_id:         'player-beta-2',
      league_id:         'league-beta-1',
      squad_id:          'squad-beta-1',
      registration_type: 'transfer',
      start_date:        new Date().toISOString().slice(0, 10),
      role:              'starter',
      position:          'Defender',
    });

    // 2. match-m1: Football, league-alpha-1, home club-alpha-1, away club-alpha-2,
    //    status in_progress, score 1-0 (score is stored via match_events)
    await trx('matches').insert({
      match_id:  'match-m1',
      league_id: 'league-alpha-1',
      sport_id:  'football',
      home_team: 'club-alpha-1',
      away_team: 'club-alpha-2',
      status:    'in_progress',
    });
    // Seed the goal event that establishes score 1-0
    await trx('match_events').insert({
      event_id:  'evt-m1-seed-1',
      match_id:  'match-m1',
      type:      'goal',
      sequence:  1,
      payload:   JSON.stringify({ team: 'home', player_id: 'player-alpha-1', minute: 12 }),
      signature: 'seed-placeholder',  // replaced by real sign() in eventsService on live usage
    });

    // 3. QR mappings for match-m1, player-alpha-1, club-alpha-1
    await trx('qr_mappings').insert([
      {
        entity_id:   'match-m1',
        entity_type: 'match',
        short_code:  'm1-live',
        short_url:   'http://localhost:8080/q/m1-live',
        scan_count:  0,
      },
      {
        entity_id:   'player-alpha-1',
        entity_type: 'player',
        short_code:  'p-alpha-1',
        short_url:   'http://localhost:8080/q/p-alpha-1',
        scan_count:  0,
      },
      {
        entity_id:   'club-alpha-1',
        entity_type: 'club',
        short_code:  'c-alpha-1',
        short_url:   'http://localhost:8080/q/c-alpha-1',
        scan_count:  0,
      },
    ]);

    // 4. Anonymous guest token: guest_anon_tok_7721 (valid, unmerged, read-only)
    await trx('guest_tokens').insert({
      token:                'guest_anon_tok_7721',
      merged:               false,
      merged_into_user_id:  null,
      merged_payload_hash:  null,
    });

    // 5. Empty persistent cart for player-alpha-1 (no rows = empty cart — nothing to insert)
    // The cart is implicitly empty; the cart-merge endpoint reads by user_id.

    // ── Phase II: module seed hooks ─────────────────────────────────────────
    await seedAll(trx);
  });

  return {
    status:  'reset_complete',
    seed,
    sports:  BASELINE_SPORTS.map(s => s.sport_id),
    tenants: ['tenant-alpha', 'tenant-beta'],
    stock,
    // Phase II entities seeded
    phase2: {
      players_added:  ['player-beta-2'],
      matches_added:  ['match-m1'],
      qr_mappings:    ['match-m1', 'player-alpha-1', 'club-alpha-1'],
      guest_tokens:   ['guest_anon_tok_7721'],
    },
  };
}

module.exports = { reset };
