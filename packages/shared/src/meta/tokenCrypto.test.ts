/**
 * Spec 004 §8.1 — token crypto unit tests.
 *
 * REQUIRES: META_TOKEN_KEY in env. The integration suite covers the
 * "no key" / wrong-length-key error paths via env validation.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { _resetKeyCache, decryptToken, encryptToken } from './tokenCrypto.js';

const hasKey = Boolean(process.env.META_TOKEN_KEY);

describe.skipIf(!hasKey)('packages/shared/src/meta/tokenCrypto.ts', () => {
  afterAll(() => {
    _resetKeyCache();
  });

  it('round-trips: encrypt → decrypt produces original plaintext', () => {
    const plaintext = 'EAAGABCDxyz123_long_lived_page_access_token';
    const encrypted = encryptToken(plaintext);
    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.tag).toHaveLength(16);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (fresh IV)', () => {
    const plaintext = 'sample_token';
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('detects tampered ciphertext (auth tag fails)', () => {
    const enc = encryptToken('original');
    const tamperedCiphertext = Buffer.from(enc.ciphertext);
    if (tamperedCiphertext.length === 0) throw new Error('ciphertext was empty');
    const lastIndex = tamperedCiphertext.length - 1;
    tamperedCiphertext[lastIndex] = (tamperedCiphertext[lastIndex] ?? 0) ^ 0x01;
    expect(() => decryptToken({ ...enc, ciphertext: tamperedCiphertext })).toThrow();
  });

  it('detects tampered tag', () => {
    const enc = encryptToken('original');
    const tamperedTag = Buffer.from(enc.tag);
    if (tamperedTag.length === 0) throw new Error('tag was empty');
    const lastIndex = tamperedTag.length - 1;
    tamperedTag[lastIndex] = (tamperedTag[lastIndex] ?? 0) ^ 0x01;
    expect(() => decryptToken({ ...enc, tag: tamperedTag })).toThrow();
  });

  it('detects tampered IV', () => {
    const enc = encryptToken('original');
    const tamperedIv = Buffer.from(enc.iv);
    if (tamperedIv.length === 0) throw new Error('iv was empty');
    const lastIndex = tamperedIv.length - 1;
    tamperedIv[lastIndex] = (tamperedIv[lastIndex] ?? 0) ^ 0x01;
    expect(() => decryptToken({ ...enc, iv: tamperedIv })).toThrow();
  });

  it('rejects empty plaintext', () => {
    expect(() => encryptToken('')).toThrow(/empty/i);
  });

  it('rejects bad IV length on decrypt', () => {
    const enc = encryptToken('original');
    expect(() => decryptToken({ ...enc, iv: Buffer.alloc(8) })).toThrow(/IV/i);
  });

  it('rejects bad tag length on decrypt', () => {
    const enc = encryptToken('original');
    expect(() => decryptToken({ ...enc, tag: Buffer.alloc(8) })).toThrow(/tag/i);
  });

  it('1000 encryptions yield 1000 distinct IVs', () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ivs.add(encryptToken('x').iv.toString('hex'));
    }
    expect(ivs.size).toBe(1000);
  });
});

describe.skipIf(hasKey)('tokenCrypto (no key)', () => {
  it('skipped: META_TOKEN_KEY not set', () => {
    expect(true).toBe(true);
  });
});
