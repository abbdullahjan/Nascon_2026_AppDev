'use strict';

const jwt          = require('jsonwebtoken');
const { AppError } = require('../utils/errors');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

// Seeded scenario context — matches Section 5.5 baseline
const SCENARIO = {
  tenant_id:         'tenant-alpha',
  foreign_tenant_id: 'tenant-beta',
  own_league_id:     'league-alpha-1',
  other_league_id:   'league-alpha-2',
  foreign_league_id: 'league-beta-1',
  own_club_id:       'club-alpha-1',
  other_club_id:     'club-alpha-2',
  foreign_club_id:   'club-beta-1',
  own_player_id:     'player-alpha-1',
  other_player_id:   'player-alpha-2',
  foreign_player_id: 'player-beta-1',
};

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN });
}

function getMatrix() {
  return {
    tokens: {
      super_admin:      makeToken({ role: 'super_admin',      tenant_id: null,           user_id: 'user-super-admin',  owned_id: null }),
      league_organizer: makeToken({ role: 'league_organizer', tenant_id: 'tenant-alpha', user_id: 'user-organizer',    owned_id: 'league-alpha-1' }),
      club_manager:     makeToken({ role: 'club_manager',     tenant_id: 'tenant-alpha', user_id: 'user-club-manager', owned_id: 'club-alpha-1' }),
      player:           makeToken({ role: 'player',           tenant_id: 'tenant-alpha', user_id: 'user-player',       owned_id: 'player-alpha-1' }),
      viewer:           makeToken({ role: 'viewer',           tenant_id: 'tenant-alpha', user_id: 'user-viewer',       owned_id: null }),
    },
    context: SCENARIO,
  };
}

/**
 * Check whether a decoded JWT token is allowed for a given probe + params.
 */
function checkProbe(role, tenantId, ownedId, allowedRoles, scopeCheck, params) {
  if (!allowedRoles.includes(role)) return false;
  if (role === 'super_admin') return true;

  if (!scopeCheck) return false;

  if (scopeCheck === 'own_league') {
    const league_id = params?.league_id;
    // Organizer: only own league; same-tenant other leagues → denied
    if (role === 'league_organizer') return ownedId === league_id;
    return false;
  }

  if (scopeCheck === 'own_club') {
    const club_id = params?.club_id;
    if (role === 'club_manager') return ownedId === club_id;
    return false;
  }

  if (scopeCheck === 'own_player') {
    const player_id = params?.player_id;
    if (role === 'club_manager') {
      // Club manager can edit players in own club
      return [SCENARIO.own_player_id].includes(player_id);
    }
    if (role === 'player') return ownedId === player_id;
    return false;
  }

  if (scopeCheck === 'same_tenant_club') {
    const club_id = params?.club_id;
    // Foreign club (tenant-beta) → denied for non-super-admin
    if (club_id === SCENARIO.foreign_club_id) return false;
    // All roles in tenant-alpha can read same-tenant clubs
    return tenantId === 'tenant-alpha';
  }

  return false;
}

module.exports = { getMatrix, checkProbe, makeToken };
