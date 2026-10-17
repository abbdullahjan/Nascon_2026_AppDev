'use strict';

process.env.DAY1_SALT = 'demo-salt';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '2h';

const rbacService = require('../src/services/rbacService');
const jwt         = require('jsonwebtoken');

describe('RBAC Service', () => {
  let matrix;

  beforeAll(async () => {
    matrix = await rbacService.getMatrix();
  });

  test('getMatrix returns tokens for all 5 roles', () => {
    expect(matrix.tokens.super_admin).toBeDefined();
    expect(matrix.tokens.league_organizer).toBeDefined();
    expect(matrix.tokens.club_manager).toBeDefined();
    expect(matrix.tokens.player).toBeDefined();
    expect(matrix.tokens.viewer).toBeDefined();
  });

  test('tokens are valid JWTs with HS256', () => {
    const decoded = jwt.verify(matrix.tokens.super_admin, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    expect(decoded.role).toBe('super_admin');
  });

  test('super_admin allowed on all probes', () => {
    const probes = [null, 'own_league', 'own_club', 'own_player', 'same_tenant_club'];
    for (const scope of probes) {
      const allowed = rbacService.checkProbe('super_admin', null, null, ['super_admin'], scope, {});
      expect(allowed).toBe(true);
    }
  });

  test('viewer denied on P1 (tenants)', () => {
    const allowed = rbacService.checkProbe('viewer', 'tenant-alpha', null, ['super_admin'], null, {});
    expect(allowed).toBe(false);
  });

  test('organizer allowed on own league only', () => {
    const ownAllowed = rbacService.checkProbe('league_organizer', 'tenant-alpha', 'league-alpha-1',
      ['super_admin', 'league_organizer'], 'own_league', { league_id: 'league-alpha-1' });
    const otherDenied = rbacService.checkProbe('league_organizer', 'tenant-alpha', 'league-alpha-1',
      ['super_admin', 'league_organizer'], 'own_league', { league_id: 'league-alpha-2' });
    expect(ownAllowed).toBe(true);
    expect(otherDenied).toBe(false);
  });

  test('club_manager denied on foreign club', () => {
    const denied = rbacService.checkProbe('club_manager', 'tenant-alpha', 'club-alpha-1',
      ['super_admin', 'club_manager'], 'own_club', { club_id: 'club-beta-1' });
    expect(denied).toBe(false);
  });

  test('player allowed on own profile only', () => {
    const ownAllowed = rbacService.checkProbe('player', 'tenant-alpha', 'player-alpha-1',
      ['super_admin', 'club_manager', 'player'], 'own_player', { player_id: 'player-alpha-1' });
    const otherDenied = rbacService.checkProbe('player', 'tenant-alpha', 'player-alpha-1',
      ['super_admin', 'club_manager', 'player'], 'own_player', { player_id: 'player-alpha-2' });
    expect(ownAllowed).toBe(true);
    expect(otherDenied).toBe(false);
  });

  test('viewer can read same-tenant club', () => {
    const allowed = rbacService.checkProbe('viewer', 'tenant-alpha', null,
      ['super_admin', 'league_organizer', 'club_manager', 'player', 'viewer'], 'same_tenant_club',
      { club_id: 'club-alpha-1' });
    expect(allowed).toBe(true);
  });

  test('viewer denied on foreign club', () => {
    const denied = rbacService.checkProbe('viewer', 'tenant-alpha', null,
      ['super_admin', 'league_organizer', 'club_manager', 'player', 'viewer'], 'same_tenant_club',
      { club_id: 'club-beta-1' });
    expect(denied).toBe(false);
  });
});
