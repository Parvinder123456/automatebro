/**
 * Spec 004 — AES-256-GCM token encryption.
 *
 * Encrypts long-lived Page Access Tokens before storing in
 * `igAccounts`. Each call produces a fresh 12-byte IV. Decryption
 * verifies the 16-byte auth tag — tampering with ciphertext, IV,
 * or tag causes decrypt() to throw.
 *
 * Key management:
 *   - The key is loaded ONCE at module init from env (META_TOKEN_KEY,
 *     base64-encoded 32 bytes). Held in process memory only.
 *   - Future key rotation: bump tokenKeyVersion on each igAccount,
 *     accept multiple keys, re-encrypt on next OAuth refresh. Out of
 *     scope for v1.
 *
 * Why GCM (not CBC + HMAC):
 *   - GCM is authenticated encryption (AEAD) — single primitive
 *     for confidentiality + integrity.
 *   - 12-byte IV is the GCM standard. NEVER reuse an IV with the
 *     same key (GCM nonce-reuse breaks confidentiality catastrophically).
 *     We use a fresh randomBytes(12) per call — collision probability
 *     ~2^-48 per encryption, negligible.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadEnv } from '../env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

/**
 * Resolve and validate the AES-256 key. Cached after first call.
 * Throws if META_TOKEN_KEY is missing, malformed, or not 32 bytes
 * after base64 decoding.
 */
export function getKey(): Buffer {
  if (cachedKey !== null) return cachedKey;
  const env = loadEnv();
  const decoded = Buffer.from(env.META_TOKEN_KEY, 'base64');
  if (decoded.length !== KEY_BYTES) {
    throw new Error(`META_TOKEN_KEY must decode to ${KEY_BYTES} bytes; got ${decoded.length}`);
  }
  cachedKey = decoded;
  return cachedKey;
}

/** Test-only: clear the cached key so tests can re-read env. */
export function _resetKeyCache(): void {
  cachedKey = null;
}

export interface EncryptedToken {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/**
 * Encrypt a token (any UTF-8 string). Returns the ciphertext, IV,
 * and auth tag — store all three. The key version isn't returned;
 * callers should record it (currently always 1).
 */
export function encryptToken(plaintext: string): EncryptedToken {
  if (plaintext.length === 0) {
    throw new Error('encryptToken: empty plaintext is not allowed');
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

/**
 * Decrypt a token. Throws if the ciphertext, IV, or tag has been
 * tampered with, or if the key has changed.
 */
export function decryptToken(encrypted: EncryptedToken): string {
  if (encrypted.iv.length !== IV_BYTES) {
    throw new Error(`decryptToken: IV must be ${IV_BYTES} bytes`);
  }
  if (encrypted.tag.length !== TAG_BYTES) {
    throw new Error(`decryptToken: tag must be ${TAG_BYTES} bytes`);
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, encrypted.iv);
  decipher.setAuthTag(encrypted.tag);
  const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
