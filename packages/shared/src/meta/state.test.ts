/**
 * Spec 004 §8.1 — OAuth state HMAC unit tests.
 */
import { describe, expect, it } from 'vitest';
import { signState, verifyState } from './state.js';

const hasSecret = Boolean(process.env.META_APP_SECRET);

describe.skipIf(!hasSecret)('packages/shared/src/meta/state.ts', () => {
  it('round-trips: signed state verifies for the same tenantId', () => {
    const tenantId = 'tenant-123';
    const state = signState(tenantId);
    const verified = verifyState(state);
    expect(verified.tenantId).toBe(tenantId);
    expect(typeof verified.issuedAt).toBe('number');
    expect(verified.issuedAt).toBeLessThanOrEqual(Date.now());
  });

  it('rejects malformed state', () => {
    expect(() => verifyState('')).toThrow(/malformed/i);
    expect(() => verifyState('only-one-part')).toThrow(/malformed/i);
    expect(() => verifyState('a.b')).toThrow(/malformed/i);
    expect(() => verifyState('a.b.c.d')).toThrow(/malformed/i);
  });

  it('rejects tampered signature', () => {
    const state = signState('tenant-x');
    const parts = state.split('.');
    if (parts.length !== 3 || parts[2] === undefined) throw new Error('test setup');
    const tampered = `${parts[0]}.${parts[1]}.${'a'.repeat(parts[2].length)}`;
    expect(() => verifyState(tampered)).toThrow();
  });

  it('rejects state where tenantId was modified after signing', () => {
    const state = signState('tenant-A');
    const parts = state.split('.');
    if (parts.length !== 3) throw new Error('test setup');
    const tampered = `${parts[0]}.tenant-B.${parts[2]}`;
    expect(() => verifyState(tampered)).toThrow(/signature/i);
  });

  it('rejects expired state (older than 5 minutes)', () => {
    const tenantId = 'tenant-old';
    // Manually craft an old state by mocking Date.now temporarily.
    const realNow = Date.now;
    Date.now = () => realNow() - 6 * 60 * 1000;
    const oldState = signState(tenantId);
    Date.now = realNow;
    expect(() => verifyState(oldState)).toThrow(/expired/i);
  });

  it('rejects bad timestamp', () => {
    expect(() => verifyState('not-a-number.tenant-x.signature-here')).toThrow();
  });
});

describe.skipIf(hasSecret)('state (no secret)', () => {
  it('skipped: META_APP_SECRET not set', () => {
    expect(true).toBe(true);
  });
});
