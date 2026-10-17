'use strict';

// Test vector from Appendix A of the spec
// Salt: demo-salt, id: evt-1, payload: {"team_id":"t1","event_type":"goal"}
// Expected signature: 972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501

process.env.DAY1_SALT = 'demo-salt';

const { sign, canonical } = require('../src/utils/hmac');

describe('HMAC Signature — Appendix A test vectors', () => {
  test('canonical JSON sorts keys correctly', () => {
    const obj    = { team_id: 't1', event_type: 'goal' };
    const result = canonical(obj);
    expect(result).toBe('{"event_type":"goal","team_id":"t1"}');
  });

  test('sign() matches Appendix A test vector', () => {
    const payload = { team_id: 't1', event_type: 'goal' };
    const sig     = sign('evt-1', payload);
    expect(sig).toBe('972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501');
  });

  test('sign() output is 64 lowercase hex chars', () => {
    const sig = sign('some-id', { foo: 'bar' });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  test('different payload produces different signature', () => {
    const sig1 = sign('evt-1', { team_id: 't1', event_type: 'goal' });
    const sig2 = sign('evt-1', { team_id: 't2', event_type: 'goal' });
    expect(sig1).not.toBe(sig2);
  });
});
