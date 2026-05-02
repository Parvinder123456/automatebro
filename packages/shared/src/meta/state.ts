/**
 * Spec 004 §3.2 — OAuth state cookie HMAC.
 *
 * The `state` parameter we send to Meta and verify on callback is
 * signed with HMAC-SHA256 using META_APP_SECRET as the key. This
 * protects against:
 *   - CSRF (attacker tricking a tenant into completing OAuth for a
 *     different IG account — they'd need to forge the signature)
 *   - Stale callback replays (state includes a timestamp; we reject
 *     anything older than 5 minutes)
 *
 * Format (URL-safe base64):
 *   <issuedAtMs>.<tenantId>.<hmac>
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../env.js';

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function hmacSecret(): string {
  return loadEnv().META_APP_SECRET;
}

function sign(payload: string): string {
  const hmac = createHmac('sha256', hmacSecret());
  hmac.update(payload);
  return hmac.digest('base64url');
}

export function signState(tenantId: string): string {
  const issuedAt = Date.now();
  const payload = `${issuedAt}.${tenantId}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export interface VerifiedState {
  tenantId: string;
  issuedAt: number;
}

export function verifyState(state: string): VerifiedState {
  const parts = state.split('.');
  if (parts.length !== 3) {
    throw new Error('verifyState: malformed state');
  }
  const [issuedAtStr, tenantId, providedSig] = parts;
  if (
    issuedAtStr === undefined ||
    tenantId === undefined ||
    providedSig === undefined ||
    issuedAtStr.length === 0 ||
    tenantId.length === 0 ||
    providedSig.length === 0
  ) {
    throw new Error('verifyState: malformed state');
  }
  const expectedSig = sign(`${issuedAtStr}.${tenantId}`);
  // Constant-time compare to prevent timing attacks.
  const expectedBuf = Buffer.from(expectedSig);
  const providedBuf = Buffer.from(providedSig);
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new Error('verifyState: bad signature');
  }
  const issuedAt = Number.parseInt(issuedAtStr, 10);
  if (Number.isNaN(issuedAt)) {
    throw new Error('verifyState: bad timestamp');
  }
  if (Date.now() - issuedAt > STATE_TTL_MS) {
    throw new Error('verifyState: state expired (older than 5 minutes)');
  }
  return { tenantId, issuedAt };
}
