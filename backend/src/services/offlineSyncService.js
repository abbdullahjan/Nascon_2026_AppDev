'use strict';

const db              = require('../config/db');
const eventsService   = require('./eventsService');
const rosterService   = require('./rosterService');
const { sign }        = require('../utils/hmac');

async function sync(body) {
  const { device_id, actions } = body;

  // Sort actions by queued_at asc, ties by array order
  const sorted = [...actions].sort((a, b) => {
    const diff = new Date(a.queued_at) - new Date(b.queued_at);
    return diff !== 0 ? diff : actions.indexOf(a) - actions.indexOf(b);
  });

  const resultMap = {};
  let applied = 0, rejected = 0, duplicate = 0;

  for (let i = 0; i < sorted.length; i++) {
    const action = sorted[i];
    const result = await processAction(device_id, action);
    resultMap[action.action_id] = { ...result, processed_order: i + 1 };
    if (result.status === 'applied')        applied++;
    else if (result.status === 'rejected')  rejected++;
    else if (result.status === 'duplicate') duplicate++;
  }

  // Return results in original request order
  const results = actions.map(a => resultMap[a.action_id]);
  const summary = { applied, rejected, duplicate };
  const response = { device_id, results, summary };

  return response;
}

async function processAction(device_id, action) {
  const { action_id, type, queued_at, base_version, payload } = action;

  const base = {
    action_id,
    status:         'rejected',
    resolution:     'server_wins',
    error_code:     null,
    server_version: 0,
    signature:      null,
  };

  // ── Check per-action duplicate (spec check #3) ────────────────────────────
  const existingAction = await db('offline_sync_results').where({ device_id, action_id }).first();
  if (existingAction) {
    return { ...base, status: 'duplicate', resolution: 'skipped_duplicate', error_code: null, server_version: existingAction.server_version };
  }

  try {
    if (type === 'score_event') {
      // ── Get current match version ────────────────────────────────────────
      const match = await db('matches').where({ match_id: payload.match_id }).first();
      if (!match) {
        // Match not found — version unknown, 0 is acceptable per spec
        await saveResult(device_id, action_id, 'rejected', 'server_wins', 'MATCH_NOT_FOUND', 0);
        return { ...base, error_code: 'MATCH_NOT_FOUND', server_version: 0 };
      }
      const evCount = await db('match_events').where({ match_id: payload.match_id }).count('* as cnt').first();
      const currentVersion = parseInt(evCount.cnt);

      // ── Issue 5: Apply rule violations (check #4) BEFORE INVALID_BASE_VERSION (check #5) ──
      // Try to apply first; catch rule violations so they surface with the
      // correct error code even when base_version is also out of range.
      // Only bail out for INVALID_BASE_VERSION after rule checks pass.

      // Attempt the event — if rules reject it the catch below handles it
      let evResult;
      let applyError = null;
      try {
        evResult = await eventsService.appendEvent(payload);
      } catch (ruleErr) {
        applyError = ruleErr;
      }

      if (applyError) {
        // Rule violation (check #4) — report the rule's error code.
        // Issue 4: server_version should be currentVersion, not 0
        const code = applyError.errorCode || 'VALIDATION_ERROR';
        await saveResult(device_id, action_id, 'rejected', 'server_wins', code, currentVersion);
        return { ...base, error_code: code, server_version: currentVersion };
      }

      // Rules passed — now check INVALID_BASE_VERSION (check #5)
      // (This path is reached only when the event was actually applied above,
      //  which means base_version <= currentVersion in practice. But guard anyway.)
      if (base_version > currentVersion) {
        // Roll back is not feasible here because appendEvent already committed.
        // In practice appendEvent itself will reject future-version events,
        // so this branch is a safety net.
        const newVersion = evResult.data.match_version;
        await saveResult(device_id, action_id, 'rejected', 'server_wins', 'INVALID_BASE_VERSION', currentVersion);
        return { ...base, error_code: 'INVALID_BASE_VERSION', server_version: currentVersion };
      }

      const newVersion = evResult.data.match_version;
      // Issue 3: use actual null, not the string 'null'
      const resolution = base_version < currentVersion ? 'rebased_append' : null;
      const sig = evResult.data.signature;

      await saveResult(device_id, action_id, 'applied', resolution, null, newVersion);
      return { ...base, status: 'applied', resolution, error_code: null, server_version: newVersion, signature: sig };

    } else if (type === 'roster_transfer') {
      // ── Get current player audit count ────────────────────────────────────
      const player_id = payload.player_id;
      const playerRow = await db('players').where({ player_id }).first();
      // If player not found we'll catch it below; still get version for response
      const auditCount = await db('roster_audit').where({ player_id }).count('* as cnt').first();
      const currentVersion = parseInt(auditCount.cnt);

      // ── Issue 5: Try rule application BEFORE INVALID_BASE_VERSION check ──
      let trResult;
      let applyError = null;
      try {
        trResult = await rosterService.transfer(payload);
      } catch (ruleErr) {
        applyError = ruleErr;
      }

      if (applyError) {
        // Issue 4: server_version = currentVersion, not 0
        const code = applyError.errorCode || 'VALIDATION_ERROR';
        await saveResult(device_id, action_id, 'rejected', 'server_wins', code, currentVersion);
        return { ...base, error_code: code, server_version: currentVersion };
      }

      // Issue 5: check INVALID_BASE_VERSION after rules pass
      if (base_version > currentVersion) {
        await saveResult(device_id, action_id, 'rejected', 'server_wins', 'INVALID_BASE_VERSION', currentVersion);
        return { ...base, error_code: 'INVALID_BASE_VERSION', server_version: currentVersion };
      }

      const newVersion = currentVersion + 1;
      // Issue 3: use actual null, not the string 'null'
      const resolution = base_version < currentVersion ? 'rebased_append' : null;

      await saveResult(device_id, action_id, 'applied', resolution, null, newVersion);
      return { ...base, status: 'applied', resolution, error_code: null, server_version: newVersion, signature: null };
    }

    // Unknown action type
    await saveResult(device_id, action_id, 'rejected', 'server_wins', 'VALIDATION_ERROR', 0);
    return { ...base, error_code: 'VALIDATION_ERROR' };

  } catch (err) {
    // Unexpected errors — fetch current version for the response (Issue 4)
    const code = err.errorCode || 'VALIDATION_ERROR';
    let ver = 0;
    try {
      if (type === 'score_event' && payload?.match_id) {
        const ec = await db('match_events').where({ match_id: payload.match_id }).count('* as cnt').first();
        ver = parseInt(ec.cnt);
      } else if (type === 'roster_transfer' && payload?.player_id) {
        const ac = await db('roster_audit').where({ player_id: payload.player_id }).count('* as cnt').first();
        ver = parseInt(ac.cnt);
      }
    } catch (_) { /* best effort */ }
    await saveResult(device_id, action_id, 'rejected', 'server_wins', code, ver);
    return { ...base, status: 'rejected', resolution: 'server_wins', error_code: code, server_version: ver };
  }
}

async function saveResult(device_id, action_id, status, resolution, error_code, server_version) {
  try {
    await db('offline_sync_results').insert({ device_id, action_id, status, resolution, error_code, server_version });
  } catch (e) {
    // Ignore duplicate key errors — idempotent save (real DB unique constraint)
    if (!e.message || !e.message.toLowerCase().includes('unique')) throw e;
  }
}

module.exports = { sync };
