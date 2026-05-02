/**
 * Spec 005 §7.1 — HMAC signature verification tests.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from './verifySignature.js';

const SECRET = 'test-app-secret-32-chars-or-more-xyz';

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('packages/shared/src/meta/verifySignature.ts', () => {
  it('valid signature passes', () => {
    const body = '{"hello":"world"}';
    const result = verifyMetaSignature({
      rawBody: body,
      signatureHeader: sign(body),
      appSecret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it('tampered body fails', () => {
    const original = '{"hello":"world"}';
    const tampered = '{"hello":"WORLD"}';
    const result = verifyMetaSignature({
      rawBody: tampered,
      signatureHeader: sign(original),
      appSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('mismatch');
  });

  it('wrong secret fails', () => {
    const body = '{"hello":"world"}';
    const result = verifyMetaSignature({
      rawBody: body,
      signatureHeader: sign(body, 'different-secret'),
      appSecret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it('missing header fails', () => {
    const result = verifyMetaSignature({
      rawBody: '{}',
      signatureHeader: null,
      appSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('missing');
  });

  it('header with bad prefix fails', () => {
    const body = '{"x":1}';
    const expected = createHmac('sha256', SECRET).update(body).digest('hex');
    const result = verifyMetaSignature({
      rawBody: body,
      signatureHeader: `sha1=${expected}`,
      appSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('prefix');
  });

  it('header with wrong length fails', () => {
    const result = verifyMetaSignature({
      rawBody: '{}',
      signatureHeader: 'sha256=tooshort',
      appSecret: SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('length');
  });

  it('handles empty body correctly (HMAC of empty string)', () => {
    const result = verifyMetaSignature({
      rawBody: '',
      signatureHeader: sign(''),
      appSecret: SECRET,
    });
    expect(result.ok).toBe(true);
  });
});
