'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { getSport } = require('./sportsService');

async function setup(body) {
  const { league, squads = [], players = [], matches_in_progress = [] } = body;
  if (!league?.league_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'league.league_id is required.', { fields: ['league'] });
  }

  // Default max_squad_size and required_positions from sport config
  let maxSquadSize     = league.max_squad_size || null;
  let requiredPositions = league.required_positions || null;

  if ((maxSquadSize === null || requiredPositions === null) && league.sport_id) {
    try {
      const sport = await getSport(league.sport_id);
      if (maxSquadSize === null && sport.roster) maxSquadSize = sport.roster.max_squad_size;
      if (requiredPositions === null && sport.roster) requiredPositions = sport.roster.required_positions;
    } catch (e) { /* sport may not exist yet — ignore */ }
  }

  await db.transaction(async (trx) => {
    // Replace existing league roster state
    await trx('player_registrations').where({ league_id: league.league_id }).delete();
    await trx('squads').where({ league_id: league.league_id }).delete();
    await trx('roster_live_matches').where({ league_id: league.league_id }).delete();

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
      maxSquadSize, JSON.stringify(requiredPositions || {}),
      JSON.stringify(league),
    ]);

    // Insert squads
    for (const sq of squads) {
      await trx('squads').insert({
        squad_id: sq.squad_id, league_id: league.league_id,
        club_id: sq.club_id, tenant_id: sq.tenant_id, name: sq.name,
      });
    }

    // Insert players and registrations
    for (const p of players) {
      await trx.raw(
        `INSERT INTO players (player_id, name, tenant_id, club_id) VALUES (?, ?, ?, ?) ON CONFLICT (player_id) DO NOTHING`,
        [p.player_id, p.name, league.tenant_id, null]
      );
      await trx('player_registrations').insert({
        player_id: p.player_id, league_id: league.league_id, squad_id: p.squad_id,
        parent_squad_id: null, registration_type: 'transfer',
        start_date: new Date().toISOString().slice(0, 10),
        role: p.role || 'starter', position: p.position,
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
    squadCounts[sq.squad_id] = players.filter(p => p.squad_id === sq.squad_id).length;
  }

  return { league_id: league.league_id, status: 'configured', squad_counts: squadCounts };
}

async function transfer(body) {
  const { request_id, league_id, player_id, type, from_squad_id, to_squad_id, effective_date, loan_end_date, reason, requested_by } = body;

  // ── Idempotency ───────────────────────────────────────────────────────────
  const existing = await db('roster_audit').where({ request_id }).first();
  if (existing) {
    if (existing.raw_body === JSON.stringify(body)) {
      return { _isReplay: true, data: JSON.parse(existing.response_body) };
    }
    throw new AppError(409, 'DUPLICATE_EVENT_ID', `request_id '${request_id}' already used.`, {});
  }

  // ── Rule 1: Schema validation ─────────────────────────────────────────────
  if (!request_id || !league_id || !player_id || !type || !from_squad_id || !effective_date) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Required fields missing.', { fields: [] });
  }
  if (!['transfer', 'loan', 'release'].includes(type)) {
    throw new AppError(400, 'VALIDATION_ERROR', `type must be transfer, loan, or release.`, { fields: ['type'] });
  }
  if (type === 'loan' && (!loan_end_date || loan_end_date <= effective_date)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'loan_end_date must be after effective_date.', { fields: ['loan_end_date'] });
  }
  if (type !== 'release' && !to_squad_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'to_squad_id is required for transfer/loan.', { fields: ['to_squad_id'] });
  }

  // ── Rule 2: Existence checks ──────────────────────────────────────────────
  const leagueRow = await db('roster_leagues').where({ league_id }).first();
  if (!leagueRow) throw new AppError(404, 'LEAGUE_NOT_FOUND', `League '${league_id}' not found.`, {});
  const playerRow = await db('players').where({ player_id }).first();
  if (!playerRow) throw new AppError(404, 'PLAYER_NOT_FOUND', `Player '${player_id}' not found.`, {});
  const fromSquad = await db('squads').where({ squad_id: from_squad_id }).first();
  if (!fromSquad) throw new AppError(404, 'SQUAD_NOT_FOUND', `Squad '${from_squad_id}' not found.`, {});
  if (to_squad_id) {
    const toSquad = await db('squads').where({ squad_id: to_squad_id }).first();
    if (!toSquad) throw new AppError(404, 'SQUAD_NOT_FOUND', `Squad '${to_squad_id}' not found.`, {});
    // ── Rule 3: Tenant check ─────────────────────────────────────────────────
    if (fromSquad.tenant_id !== toSquad.tenant_id) {
      throw new AppError(409, 'CROSS_TENANT_TRANSFER', 'Cannot transfer across tenants.', {});
    }
  }

  // ── Rule 4: Player in from_squad ───────────────────────────────────────────
  const reg = await db('player_registrations').where({ player_id, league_id, squad_id: from_squad_id }).first();
  if (!reg) throw new AppError(409, 'NOT_IN_SQUAD', 'Player is not in the specified squad.', {});

  // ── Rule 5: Transfer window (not for release) ────────────────────────────
  if (type !== 'release' && leagueRow.transfer_window_open && leagueRow.transfer_window_close) {
    if (effective_date < leagueRow.transfer_window_open || effective_date > leagueRow.transfer_window_close) {
      throw new AppError(409, 'TRANSFER_WINDOW_CLOSED', 'Transfer window is closed.', {});
    }
  }

  // ── Rule 6: Player on loan ────────────────────────────────────────────────
  if (reg.registration_type === 'loan') {
    throw new AppError(409, 'PLAYER_ON_LOAN', 'Player is currently on loan.', {});
  }

  // ── Rule 7: Squad full ────────────────────────────────────────────────────
  if (type !== 'release' && to_squad_id) {
    let maxSize = leagueRow.max_squad_size;
    if (!maxSize) {
      // Default from sport config
      try {
        const sport = await getSport(leagueRow.sport_id);
        maxSize = sport.roster?.max_squad_size || 999;
      } catch { maxSize = 999; }
    }
    const currentCount = await db('player_registrations')
      .where({ league_id, squad_id: to_squad_id }).count('* as cnt').first();
    if (parseInt(currentCount.cnt) + 1 > maxSize) {
      throw new AppError(409, 'SQUAD_FULL', 'Destination squad is full.', {});
    }
  }

  // ── Rule 8: Min position check ────────────────────────────────────────────
  const reqPos = JSON.parse(leagueRow.required_positions || '{}');
  if (Object.keys(reqPos).length > 0 && reg.position) {
    const minRequired = reqPos[reg.position] || 0;
    if (minRequired > 0) {
      const posCount = await db('player_registrations')
        .where({ league_id, squad_id: from_squad_id, position: reg.position })
        .count('* as cnt').first();
      if (parseInt(posCount.cnt) - 1 < minRequired) {
        throw new AppError(409, 'MIN_POSITION_VIOLATION',
          `Squad would fall below minimum ${reg.position} requirement.`, {});
      }
    }
  }

  // ── Check in-progress match (edge case 6) ────────────────────────────────
  const liveMatches = await db('roster_live_matches').where({ league_id });
  const isDeferred = liveMatches.some(m =>
    m.home_squad_id === from_squad_id || m.away_squad_id === from_squad_id
  );
  const blockingMatchId = isDeferred
    ? liveMatches.find(m => m.home_squad_id === from_squad_id || m.away_squad_id === from_squad_id)?.match_id || null
    : null;

  const now     = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const auditId = `au-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const state   = isDeferred ? 'deferred_until_match_end' : 'active';

  // ── Apply transfer ─────────────────────────────────────────────────────────
  let registration = null;

  if (!isDeferred) {
    if (type === 'release') {
      await db('player_registrations').where({ player_id, league_id }).delete();
    } else {
      await db('player_registrations').where({ player_id, league_id }).update({
        squad_id:          to_squad_id,
        parent_squad_id:   type === 'loan' ? from_squad_id : null,
        registration_type: type,
        start_date:        effective_date,
        loan_end_date:     loan_end_date || null,
        role:              'substitute',
      });
    }
  }

  if (type !== 'release') {
    registration = {
      player_id,
      league_id,
      squad_id:          to_squad_id,
      parent_squad_id:   type === 'loan' ? from_squad_id : null,
      registration_type: type,
      start_date:        effective_date,
      loan_end_date:     loan_end_date || null,
      role:              'substitute',
    };
  }

  const auditEntry = {
    audit_id:    auditId,
    action:      type,
    player_id,
    league_id,
    from_squad_id,
    to_squad_id: to_squad_id || null,
    effective_date,
    state,
    who:         requested_by,
    when:        now,
    why:         reason || null,
  };

  const responseData = {
    request_id,
    status:            'accepted',
    state,
    blocking_match_id: blockingMatchId,
    registration,
    audit_entry:        auditEntry,
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

  // Get all audit entries for this player, ordered by creation
  const history = await db('roster_audit').where({ player_id }).orderBy('id', 'asc');

  // ── Process loan returns based on as_of date ─────────────────────────────
  // If a loan's loan_end_date has passed by as_of, and no loan_return entry
  // exists yet, generate one
  const auditEntries = [];
  const loanReturnGenerated = new Set();

  for (const h of history) {
    const entry = JSON.parse(h.response_body)?.audit_entry;
    if (!entry) continue;

    auditEntries.push(entry);

    // Check if this is a loan that should have been returned by as_of
    if (entry.action === 'loan' && entry.to_squad_id) {
      // Find the loan_end_date from the stored response
      const reg = JSON.parse(h.response_body)?.registration;
      const loanEnd = reg?.loan_end_date;
      if (loanEnd && asOfDate > loanEnd) {
        // Check if a loan_return already exists for this loan
        const existingReturn = history.some(h2 => {
          const e2 = JSON.parse(h2.response_body)?.audit_entry;
          return e2?.action === 'loan_return' && e2?.from_squad_id === entry.to_squad_id;
        });
        if (!existingReturn && !loanReturnGenerated.has(h.request_id)) {
          loanReturnGenerated.add(h.request_id);
          // Generate loan_return audit entry
          const returnEntry = {
            audit_id:    `au-return-${h.request_id}`,
            action:      'loan_return',
            player_id,
            league_id:   entry.league_id,
            from_squad_id: entry.to_squad_id,
            to_squad_id:  entry.from_squad_id,
            effective_date: loanEnd,
            state:       'active',
            who:         'system',
            when:        loanEnd + 'T00:00:00Z',
            why:         'Automatic loan return',
          };
          auditEntries.push(returnEntry);

          // Persist this entry so repeated calls don't duplicate it
          await db('roster_audit').insert({
            request_id:   `return-${h.request_id}`,
            audit_id:     returnEntry.audit_id,
            player_id,
            league_id:    entry.league_id,
            action:       'loan_return',
            from_squad_id: entry.to_squad_id,
            to_squad_id:  entry.from_squad_id,
            effective_date: loanEnd,
            state:        'active',
            who:          'system',
            why:          'Automatic loan return',
            raw_body:     JSON.stringify({ auto_return: true, original_request_id: h.request_id }),
            response_body: JSON.stringify({ audit_entry: returnEntry }),
          });
        }
      }
    }
  }

  // ── Determine current squad based on as_of ────────────────────────────────
  let currentSquadId  = null;
  let parentSquadId   = null;
  let currentLeagueId = null;

  for (const entry of auditEntries) {
    if (asOfDate < entry.effective_date) continue; // skip events after as_of

    currentLeagueId = entry.league_id;
    if (entry.action === 'release') {
      currentSquadId = null;
      parentSquadId  = null;
    } else if (entry.action === 'transfer') {
      currentSquadId = entry.to_squad_id;
      parentSquadId  = null;
    } else if (entry.action === 'loan') {
      currentSquadId = entry.to_squad_id;
      parentSquadId  = entry.from_squad_id;
    } else if (entry.action === 'loan_return') {
      currentSquadId = entry.to_squad_id;   // back to parent
      parentSquadId  = null;
    }
  }

  return {
    player_id,
    as_of:            asOfDate,
    league_id:        currentLeagueId,
    current_squad_id: currentSquadId,
    parent_squad_id:  parentSquadId,
    history:          auditEntries,
  };
}

module.exports = { setup, transfer, getHistory };
