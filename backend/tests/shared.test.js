'use strict';

/**
 * Unit tests for src/shared/
 *
 * Covers:
 *   1. canonical() — key sorting, types, nested objects, arrays, unicode
 *   2. sign_day2() — exact hash assertions from Appendix A (salt T01D27ad7ffff12e)
 *   3. Validator   — required/optional fields, enum, throw behaviour
 *   4. throwValidation / throwNotFound / throwConflict / throwForbidden
 *
 * Every test that expects a throw uses expect.assertions(n) so a silent
 * no-throw cannot produce a false pass.
 */

// ── Set env vars BEFORE requiring any module that reads them ─────────────────
const REFERENCE_SALT = 'T01D27ad7ffff12e';
process.env.DAY2_SALT = REFERENCE_SALT;
process.env.DAY1_SALT = 'demo-salt';

const { canonical }                   = require('../src/shared/canonical');
const { sign_day2 }                   = require('../src/shared/sign');
const { Validator }                   = require('../src/shared/validate');
const { AppError, throwValidation,
        throwNotFound, throwConflict,
        throwForbidden }              = require('../src/shared/errors');

// ─────────────────────────────────────────────────────────────────────────────
// canonical()
// ─────────────────────────────────────────────────────────────────────────────
describe('canonical()', () => {
  test('null → "null"', () => {
    expect(canonical(null)).toBe('null');
  });

  test('true → "true", false → "false"', () => {
    expect(canonical(true)).toBe('true');
    expect(canonical(false)).toBe('false');
  });

  test('integers have no decimal point', () => {
    expect(canonical(0)).toBe('0');
    expect(canonical(42)).toBe('42');
    expect(canonical(-7)).toBe('-7');
  });

  test('string is JSON-quoted', () => {
    expect(canonical('hello')).toBe('"hello"');
    expect(canonical('say "hi"')).toBe('"say \\"hi\\""');
  });

  test('empty object → {}', () => {
    expect(canonical({})).toBe('{}');
  });

  test('object keys are sorted', () => {
    expect(canonical({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  test('nested object keys sorted at every depth', () => {
    const obj = { z: { y: 1, x: 2 }, a: { d: 3, c: 4 } };
    expect(canonical(obj)).toBe('{"a":{"c":4,"d":3},"z":{"x":2,"y":1}}');
  });

  test('arrays preserve order', () => {
    expect(canonical([3, 1, 2])).toBe('[3,1,2]');
  });

  test('array of objects — each object sorted', () => {
    const arr = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
    expect(canonical(arr)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });

  test('mixed types in object', () => {
    const obj = { flag: true, count: 0, name: 'x', empty: null };
    expect(canonical(obj)).toBe('{"count":0,"empty":null,"flag":true,"name":"x"}');
  });

  // ── Unicode / non-ASCII — ensure_ascii=False equivalent ────────────────────
  test('non-ASCII chars are NOT escaped (ensure_ascii=False)', () => {
    const result = canonical({ city: 'کراچی' });
    expect(result).toBe('{"city":"کراچی"}');
    expect(result).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });

  test('emoji in string stays as raw character', () => {
    const result = canonical({ emoji: '⚽' });
    expect(result).toBe('{"emoji":"⚽"}');
    expect(result).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });

  // ── Appendix A sig_payload canonical form ──────────────────────────────────
  test('Appendix A stream key sig_payload canonical form', () => {
    const payload = {
      action:     'rotate',
      player_id:  'player-alpha-1',
      status:     'active',
      stream_key: 'sk_live_9f83a1b2c3d4e5f6',
    };
    expect(canonical(payload)).toBe(
      '{"action":"rotate","player_id":"player-alpha-1","status":"active","stream_key":"sk_live_9f83a1b2c3d4e5f6"}'
    );
  });

  // ── Nested / unicode / null / bool (task requirement) ──────────────────────
  test('nested array with null and bool, unicode string — exact output', () => {
    // é = U+00E9 precomposed (same as the spec example)
    const payload = { b: '\u00e9', a: [1, { z: null, y: true }] };
    expect(canonical(payload)).toBe('{"a":[1,{"y":true,"z":null}],"b":"\u00e9"}');
  });

  test('no whitespace in output', () => {
    expect(canonical({ a: 1, b: [2, 3] })).not.toMatch(/\s/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sign_day2()
// ─────────────────────────────────────────────────────────────────────────────
describe('sign_day2()', () => {
  test('output is 64 lowercase hex characters', () => {
    expect(sign_day2('some-id', { foo: 'bar' })).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── Appendix A Vector 1 — exact hash assertion ─────────────────────────────
  test('Appendix A Vector 1 — stream key rotate (exact hash)', () => {
    // salt    = T01D27ad7ffff12e
    // entity  = sk_live_9f83a1b2c3d4e5f6
    // payload = {action:rotate, player_id:player-alpha-1, status:active, stream_key:sk_live_9f83a1b2c3d4e5f6}
    // message = sk_live_9f83a1b2c3d4e5f6|{"action":"rotate","player_id":"player-alpha-1","status":"active","stream_key":"sk_live_9f83a1b2c3d4e5f6"}
    expect(
      sign_day2('sk_live_9f83a1b2c3d4e5f6', {
        action:     'rotate',
        player_id:  'player-alpha-1',
        status:     'active',
        stream_key: 'sk_live_9f83a1b2c3d4e5f6',
      })
    ).toBe('9bd054eb746844b4701c6f158209c315ef2b16f392efd733bdf0715940610289');
  });

  // ── Appendix A Vector 2 — exact hash assertion ─────────────────────────────
  test('Appendix A Vector 2 — legacy 2-key payload (exact hash)', () => {
    // salt    = T01D27ad7ffff12e
    // entity  = sk_live_101
    // payload = {action:rotate, player_id:player-alpha-1}
    // message = sk_live_101|{"action":"rotate","player_id":"player-alpha-1"}
    expect(
      sign_day2('sk_live_101', {
        action:    'rotate',
        player_id: 'player-alpha-1',
      })
    ).toBe('830b24eb2c795c02c54c17516b0e96870f5b65d98d28c2f0a15619ec3e076188');
  });

  // ── Nested / unicode / null / bool vector — exact hash assertion ────────────
  test('nested array with unicode, null, bool (exact hash)', () => {
    // salt    = T01D27ad7ffff12e
    // entity  = x
    // payload = {b:'é', a:[1,{z:null,y:true}]}
    // canonical→ {"a":[1,{"y":true,"z":null}],"b":"é"}
    // message = x|{"a":[1,{"y":true,"z":null}],"b":"é"}
    expect(
      sign_day2('x', { b: '\u00e9', a: [1, { z: null, y: true }] })
    ).toBe('a0bd7d814c9c6519f8aad9d8c8964c305957ea344977c400d44025378f623e75');
  });

  test('sign_day2 is deterministic — same inputs always same output', () => {
    const payload = { action: 'rotate', player_id: 'player-alpha-1', status: 'active', stream_key: 'sk_live_9f83a1b2c3d4e5f6' };
    expect(sign_day2('sk_live_9f83a1b2c3d4e5f6', payload))
      .toBe(sign_day2('sk_live_9f83a1b2c3d4e5f6', payload));
  });

  test('pipe separator — message is exactly entity_id + "|" + canonical(payload)', () => {
    const crypto   = require('crypto');
    const entityId = 'test-entity';
    const payload  = { z: 1, a: 2 };
    const expected = crypto
      .createHmac('sha256', Buffer.from(REFERENCE_SALT, 'utf8'))
      .update(Buffer.from('test-entity|' + canonical(payload), 'utf8'))
      .digest('hex');
    expect(sign_day2(entityId, payload)).toBe(expected);
  });

  test('different payloads produce different signatures', () => {
    expect(sign_day2('id', { a: 1 })).not.toBe(sign_day2('id', { a: 2 }));
  });

  test('different entity IDs produce different signatures', () => {
    const payload = { a: 1 };
    expect(sign_day2('id-1', payload)).not.toBe(sign_day2('id-2', payload));
  });

  test('nested payload — key order in canonical does not affect HMAC', () => {
    const crypto  = require('crypto');
    const msgStr  = 'nested-test|{"flag":true,"outer":{"inner":"value","num":42}}';
    const expected = crypto
      .createHmac('sha256', Buffer.from(REFERENCE_SALT, 'utf8'))
      .update(Buffer.from(msgStr, 'utf8'))
      .digest('hex');
    expect(
      sign_day2('nested-test', { outer: { inner: 'value', num: 42 }, flag: true })
    ).toBe(expected);
  });

  test('throws if DAY2_SALT is not set', () => {
    expect.assertions(1);
    const old = process.env.DAY2_SALT;
    delete process.env.DAY2_SALT;
    try {
      sign_day2('id', {});
    } catch (e) {
      expect(e.message).toMatch(/DAY2_SALT/);
    } finally {
      process.env.DAY2_SALT = old;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────
describe('Validator', () => {
  test('passes when all required fields present and correct type', () => {
    const v = new Validator({ action: 'rotate', player_id: 'p1' });
    v.require('action',    'string');
    v.require('player_id', 'string');
    expect(() => v.throw()).not.toThrow();
  });

  test('throws VALIDATION_ERROR for missing required field', () => {
    expect.assertions(4);
    const v = new Validator({ action: 'rotate' });
    v.require('action',    'string');
    v.require('player_id', 'string');
    try {
      v.throw();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e.httpStatus).toBe(400);
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toContain('player_id');
    }
  });

  test('throws VALIDATION_ERROR for wrong type', () => {
    expect.assertions(2);
    const v = new Validator({ count: 'not-a-number' });
    v.require('count', 'number');
    try {
      v.throw();
    } catch (e) {
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toContain('count');
    }
  });

  test('enum validation rejects invalid value', () => {
    expect.assertions(2);
    const v = new Validator({ action: 'invalid' });
    v.require('action', 'string', { enum: ['generate', 'rotate', 'revoke'] });
    try {
      v.throw();
    } catch (e) {
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toContain('action');
    }
  });

  test('enum validation passes valid value', () => {
    const v = new Validator({ action: 'rotate' });
    v.require('action', 'string', { enum: ['generate', 'rotate', 'revoke'] });
    expect(() => v.throw()).not.toThrow();
  });

  test('optional field skipped when absent', () => {
    const v = new Validator({ action: 'rotate' });
    v.require('action', 'string');
    v.optional('label',  'string');
    expect(() => v.throw()).not.toThrow();
  });

  test('optional field validated when present with wrong type', () => {
    expect.assertions(2);
    const v = new Validator({ action: 'rotate', label: 123 });
    v.require('action', 'string');
    v.optional('label',  'string');
    try {
      v.throw();
    } catch (e) {
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toContain('label');
    }
  });

  test('array type check works', () => {
    const v = new Validator({ participants: ['p1', 'p2'] });
    v.require('participants', 'array', { minItems: 1, maxItems: 4 });
    expect(() => v.throw()).not.toThrow();
  });

  test('array maxItems violation', () => {
    expect.assertions(2);
    const v = new Validator({ participants: ['p1', 'p2', 'p3', 'p4', 'p5'] });
    v.require('participants', 'array', { maxItems: 4 });
    try {
      v.throw();
    } catch (e) {
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toContain('participants');
    }
  });

  test('deduplicated fields list', () => {
    expect.assertions(1);
    const v = new Validator({});
    v.require('a', 'string');
    v.require('a', 'string'); // intentional duplicate
    try {
      v.throw();
    } catch (e) {
      const count = e.details.fields.filter(f => f === 'a').length;
      expect(count).toBe(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error helpers
// ─────────────────────────────────────────────────────────────────────────────
describe('Error helpers', () => {
  test('throwValidation creates 400 AppError with fields', () => {
    expect.assertions(4);
    try {
      throwValidation(['field1', 'field2'], 'Bad input');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e.httpStatus).toBe(400);
      expect(e.errorCode).toBe('VALIDATION_ERROR');
      expect(e.details.fields).toEqual(['field1', 'field2']);
    }
  });

  test('throwNotFound creates 404 AppError', () => {
    expect.assertions(3);
    try {
      throwNotFound('PLAYER_NOT_FOUND', 'Player does not exist.', { player_id: 'p1' });
    } catch (e) {
      expect(e.httpStatus).toBe(404);
      expect(e.errorCode).toBe('PLAYER_NOT_FOUND');
      expect(e.details.player_id).toBe('p1');
    }
  });

  test('throwConflict creates 409 AppError', () => {
    expect.assertions(2);
    try {
      throwConflict('COSTREAM_SESSION_FULL', 'Too many participants.');
    } catch (e) {
      expect(e.httpStatus).toBe(409);
      expect(e.errorCode).toBe('COSTREAM_SESSION_FULL');
    }
  });

  test('throwForbidden creates 403 AppError with guest_token detail', () => {
    expect.assertions(3);
    try {
      throwForbidden('GUEST_WRITE_FORBIDDEN', 'Guests cannot write.', { guest_token: 'guest_anon_tok_7721' });
    } catch (e) {
      expect(e.httpStatus).toBe(403);
      expect(e.errorCode).toBe('GUEST_WRITE_FORBIDDEN');
      expect(e.details.guest_token).toBe('guest_anon_tok_7721');
    }
  });
});
