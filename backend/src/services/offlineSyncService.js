'use strict';

const db              = require('../config/db');
const eventsService   = require('./eventsService');
const rosterService   = require('./rosterService');
const { sign }        = require('../utils/hmac');

async function sync(body) {
  const { device_id, actions } = body;

  // Check if entire request was already processed (full idempotency)
  const requestKey = `${device_id}:${JSON.stringify(actions.map(a => a.action_id).sort())}`;
  const existingReq = await db('offline_sync_requests').where({ request_key: requestKey }).first();
  if (existingReq) {
    return JSON.parse(existingReq.response_body);
  }

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
    if (result.status === 'applied')   applied++;
    else if (result.status === 'rejected') rejected++;
    else if (result.status === 'duplicate') duplicate++;
  }

  // Return results in original request order
  const results = actions.map(a => resultMap[a.action_id]);
  const summary = { applied, rejected, duplicate };
  const response = { device_id, results, summary };

  await db('offline_sync_requests').insert({
    request_key,
    device_id,
    response_body: JSON.stringify(response),
  });

  return response;
}

async function processAction(device_id, action) {
  const { action_id, type, queued_at, base_version, payload } = action;

  const base = {
    action_id,
    status:       'rejected',
    resolution:   'server_wins',
    error_code:   null,
    server_version: 0,
    signature:    null,
  };

  // Check per-action duplicate
  const existingAction = await db('offline_sync_results').where({ device_id, action_id }).first();
  if (existingAction) {
    return { ...base, status: 'duplicate', resolution: 'skipped_duplicate', error_code: null, server_version: existingAction.server_version };
  }

  try {
    if (type === 'score_event') {
      // Get current match version
      const match = await db('matches').where({ match_id: payload.match_id }).first();
      if (!match) {
        await saveResult(device_id, action_id, 'rejected', 'server_wins', 'MATCH_NOT_FOUND', 0);
        return { ...base, error_code: 'MATCH_NOT_FOUND', server_version: 0 };
      }
      const evCount = await db('match_events').where({ match_id: payload.match_id }).count('* as cnt').first();
      const currentVersion = parseInt(evCount.cnt);

      if (base_version > currentVersion) {
        await saveResult(device_id, action_id, 'rejected', 'server_wins', 'INVALID_BASE_VERSION', currentVersion);
        return { ...base, error_code: 'INVALID_BASE_VERSION', server_version: currentVersion };
      }

      // Try to apply
      const evResult = await eventsService.appendEvent(payload);
      const newVersion = evResult.data.match_version;
      const resolution = base_version < currentVersion ? 'rebased_append' : 'null';
      const sig = evResult.data.signature;

      await saveResult(device_id, action_id, 'applied', resolution, null, newVersion);
      return { ...base, status: 'applied', resolution, error_code: null, server_version: newVersion, signature: sig };

    } else if (type === 'roster_transfer') {
      // Get current player audit count
      const player_id = payload.player_id;
      const auditCount = await db('roster_audit').where({ player_id }).count('* as cnt').first();
      const currentVersion = parseInt(auditCount.cnt);

      if (base_version > currentVersion) {
        await saveResult(device_id, action_id, 'rejected', 'server_wins', 'INVALID_BASE_VERSION', currentVersion);
        return { ...base, error_code: 'INVALID_BASE_VERSION', server_version: currentVersion };
      }

      const trResult = await rosterService.transfer(payload);
      const newVersion = currentVersion + 1;
      const resolution = base_version < currentVersion ? 'rebased_append' : 'null';

      await saveResult(device_id, action_id, 'applied', resolution, null, newVersion);
      return { ...base, status: 'applied', resolution, error_code: null, server_version: newVersion, signature: null };
    }

    return { ...base, error_code: 'VALIDATION_ERROR' };

  } catch (err) {
    const code = err.errorCode || 'VALIDATION_ERROR';
    const ver  = 0;
    await saveResult(device_id, action_id, 'rejected', 'server_wins', code, ver);
    return { ...base, status: 'rejected', resolution: 'server_wins', error_code: code, server_version: ver };
  }
}

async function saveResult(device_id, action_id, status, resolution, error_code, server_version) {
  await db('offline_sync_results').insert({ device_id, action_id, status, resolution, error_code, server_version }).onConflict(['device_id','action_id']).ignore();
}

module.exports = { sync };
