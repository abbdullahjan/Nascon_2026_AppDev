'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');

async function setup(body) {
  const { league, squads = [], players = [], matches_in_progress = [] } = body;
  if (!league?.league_id) throw new AppError(400, 'VALIDATION_ERROR', 'league.league_id is required.', { fields: ['league'] });

  await db.transaction(async (trx) => {
    // Replace existing league roster state
    await trx('player_registrations').where({ league_id: league.league_id }).delete();
    await trx('squads').where({ league_id: league.league_id }).delete();

    // Upsert league roster config
    await trx.raw(`
      INSERT INTO roster_leagues (league_id, tenant_id, sport_id, transfer_window_open, transfer_window_close, max_squad_size, required_positions, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (league_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id, sport_id = EXCLUDED.sport_id,
        transfer_window_open = EXCLUDED.transfer_window_open, transfer_window_close = EXCLUDED.transfer_window_close,
        max_squad_size = EXCLUDED.max_squad_size, required_positions = EXCLUDED.required_positions, config = EXCLUDED.config
    `, [
      league.league_id, league.tenant_id, league.sport_id,
      league.transfer_window?.open || null, league.transfer_window?.close || null,
      league.max_squad_size || null, JSON.stringify(league.required_positions || {}),
      JSON.stringify(league),
    ]);

    // Insert squads
    for (const sq of squads) {
      await trx('squads').insert({ squad_id: sq.squad_id, league_id: league.league_id, club_id: sq.club_id, tenant_id: sq.tenant_id, name: sq.name });
    }

    // Insert players and registrations
    for (const p of players) {
      await trx.raw(`INSERT INTO players (player_id, name, tenant_id, club_id) VALUES (?, ?, ?, ?) ON CONFLICT (player_id) DO NOTHING`, [p.player_id, p.name, league.tenant_id, null]);
      await trx('player_registrations').insert({
        player_id: p.player_id, league_id: league.league_id, squad_id: p.squad_id,
        parent_squad_id: null, registration_type: 'transfer',
        start_date: new Date().toISOString().slice(0,10), role: p.role || 'starter',
        position: p.position,
      });
    }

    // Store in-progress matches
    for (const m of matches_in_progress) {
      await trx.raw(`
        INSERT INTO roster_live_matches (match_id, league_id, home_squad_id, away_squad_id)
        VALUES (?, ?, ?, ?) ON CONFLICT (match_id) DO NOTHING
      `, [m.match_id, league.league_id, m.home_squad_id, m.away_squad_id]);
    }
  });

  const squadCounts = {};
  for (const sq of squads) {
    const count = players.filter(p => p.squad_id === sq.squad_id).length;
    squadCounts[sq.squad_id] = count;
  }

  return { league_id: league.league_id, status: 'configured', squad_counts: squadCounts };
}

async function transfer(body) {
  const { request_id, league_id, player_id, type, from_squad_id, to_squad_id, effective_date, loan_end_date, reason, requested_by } = body;

  // Idempotency
  const existing = await db('roster_audit').where({ request_id }).first();
  if (existing) {
    const bodyStr = JSON.stringify(body);
    if (existing.raw_body === bodyStr) return { _isReplay: true, data: JSON.parse(existing.response_body) };
    throw new AppError(409, 'DUPLICATE_EVENT_ID', `request_id '${request_id}' already used.`, {});
  }

  // Rule 1 — Schema
  if (!request_id || !league_id || !player_id || !type || !from_squad_id || !effective_date) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Required fields missing.', { fields: [] });
  }
  if (type === 'loan' && (!loan_end_date || loan_end_date <= effective_date)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'loan_end_date must be after effective_date.', { fields: ['loan_end_date'] });
  }
  if (type !== 'release' && !to_squad_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'to_squad_id is required for transfer/loan.', { fields: ['to_squad_id'] });
  }

  // Rule 2 — Existence checks
  const leagueRow = await db('roster_leagues').where({ league_id }).first();
  if (!leagueRow) throw new AppError(404, 'LEAGUE_NOT_FOUND', `League '${league_id}' not found.`, {});
  const playerRow = await db('players').where({ player_id }).first();
  if (!playerRow) throw new AppError(404, 'PLAYER_NOT_FOUND', `Player '${player_id}' not found.`, {});
  const fromSquad = await db('squads').where({ squad_id: from_squad_id }).first();
  if (!fromSquad) throw new AppError(404, 'SQUAD_NOT_FOUND', `Squad '${from_squad_id}' not found.`, {});
  if (to_squad_id) {
    const toSquad = await db('squads').where({ squad_id: to_squad_id }).first();
    if (!toSquad) throw new AppError(404, 'SQUAD_NOT_FOUND', `Squad '${to_squad_id}' not found.`, {});
    // Rule 3 — Tenant check
    if (fromSquad.tenant_id !== toSquad.tenant_id) throw new AppError(409, 'CROSS_TENANT_TRANSFER', 'Cannot transfer across tenants.', {});
  }

  // Rule 4 — Player in from_squad
  const reg = await db('player_registrations').where({ player_id, league_id, squad_id: from_squad_id }).first();
  if (!reg) throw new AppError(409, 'NOT_IN_SQUAD', 'Player is not in the specified squad.', {});

  // Rule 5 — Transfer window (not for release)
  if (type !== 'release' && leagueRow.transfer_window_open && leagueRow.transfer_window_close) {
    if (effective_date < leagueRow.transfer_window_open || effective_date > leagueRow.transfer_window_close) {
      throw new AppError(409, 'TRANSFER_WINDOW_CLOSED', 'Transfer window is closed.', {});
    }
  }

  // Rule 6 — Player on loan
  if (reg.registration_type === 'loan') throw new AppError(409, 'PLAYER_ON_LOAN', 'Player is currently on loan.', {});

  if (type !== 'release' && to_squad_id) {
    // Rule 7 — Squad full
    const config = JSON.parse(leagueRow.config);
    const maxSize = config.max_squad_size || 999;
    const currentCount = await db('player_registrations').where({ league_id, squad_id: to_squad_id }).count('* as cnt').first();
    if (parseInt(currentCount.cnt) + 1 > maxSize) throw new AppError(409, 'SQUAD_FULL', 'Destination squad is full.', {});
  }

  // Rule 8 — Min position check
  const reqPos = JSON.parse(leagueRow.required_positions || '{}');
  if (Object.keys(reqPos).length > 0 && reg.position) {
    const minRequired = reqPos[reg.position] || 0;
    if (minRequired > 0) {
      const posCount = await db('player_registrations').where({ league_id, squad_id: from_squad_id, position: reg.position }).count('* as cnt').first();
      if (parseInt(posCount.cnt) - 1 < minRequired) throw new AppError(409, 'MIN_POSITION_VIOLATION', `Squad would fall below minimum ${reg.position} requirement.`, {});
    }
  }

  // Check in-progress match
  const liveMatch = await db('roster_live_matches').where({ league_id }).where(function() {
    this.where('home_squad_id', from_squad_id).orWhere('away_squad_id', from_squad_id);
  }).first();
  const isDeferred = !!liveMatch;

  const now  = new Date().toISOString();
  const auditId = `au-${Date.now()}`;
  const state = isDeferred ? 'deferred_until_match_end' : 'active';

  let registration = null;
  if (!isDeferred) {
    await db.transaction(async (trx) => {
      if (type === 'release') {
        await trx('player_registrations').where({ player_id, league_id }).delete();
      } else {
        await trx('player_registrations').where({ player_id, league_id }).update({
          squad_id:          to_squad_id,
          parent_squad_id:   type === 'loan' ? from_squad_id : null,
          registration_type: type,
          start_date:        effective_date,
          loan_end_date:     loan_end_date || null,
          role:              'substitute',
        });
      }
    });
  }

  if (type !== 'release') {
    registration = {
      player_id, league_id,
      squad_id:          to_squad_id,
      parent_squad_id:   type === 'loan' ? from_squad_id : null,
      registration_type: type,
      start_date:        effective_date,
      loan_end_date:     loan_end_date || null,
      role:              'substitute',
    };
  }

  const auditEntry = {
    audit_id:       auditId,
    action:         type,
    player_id,
    league_id,
    from_squad_id,
    to_squad_id:    to_squad_id || null,
    effective_date,
    state,
    who:            requested_by,
    when:           now,
    why:            reason || null,
  };

  const responseData = {
    request_id,
    status:            'accepted',
    state,
    blocking_match_id: isDeferred ? liveMatch.match_id : null,
    registration,
    audit_entry:       auditEntry,
  };

  await db('roster_audit').insert({
    request_id,
    audit_id:      auditId,
    player_id,
    league_id,
    action:        type,
    from_squad_id,
    to_squad_id:   to_squad_id || null,
    effective_date,
    state,
    who:           requested_by,
    why:           reason || null,
    raw_body:      JSON.stringify(body),
    response_body: JSON.stringify(responseData),
  });

  return { _isReplay: false, data: responseData };
}

async function getHistory(player_id, as_of) {
  const playerRow = await db('players').where({ player_id }).first();
  if (!playerRow) throw new AppError(404, 'PLAYER_NOT_FOUND', `Player '${player_id}' not found.`, {});

  const asOfDate = as_of || new Date().toISOString().slice(0, 10);

  const history  = await db('roster_audit').where({ player_id }).orderBy('created_at', 'asc');
  const lastReg  = await db('player_registrations').where({ player_id }).first();

  return {
    player_id,
    as_of:            asOfDate,
    league_id:        lastReg?.league_id || null,
    current_squad_id: lastReg?.squad_id  || null,
    parent_squad_id:  lastReg?.parent_squad_id || null,
    history:          history.map(h => JSON.parse(h.response_body)?.audit_entry || h),
  };
}

module.exports = { setup, transfer, getHistory };
