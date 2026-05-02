/**
 * Spec 005 §3.1 — HMAC-SHA256 signature verification for Meta webhooks.
 *
 * Meta signs every webhook POST with HMAC-SHA256 using our App Secret
 * as the key, computed over the raw request body. The signature is sent
 * in the `X-Hub-Signature-256` header as `sha256=<hex>`.
 *
 * We verify with a constant-time compare to defeat timing attacks. The
 * verification MUST happen before any handler logic — bad signature →
 * 401 immediately, no DB write, no logs other than a single warning.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const HEADER_PREFIX = 'sha256=';

export interface VerifySignatureArgs {
  /** Raw request body (NOT JSON-parsed). */
  rawBody: string;
  /** Value of the X-Hub-Signature-256 header. */
  signatureHeader: string | null | undefined;
  /** META_APP_SECRET — used as the HMAC key. */
  appSecret: string;
}

export interface VerifySignatureResult {
  ok: boolean;
  reason?: string;
}

export function verifyMetaSignature(args: VerifySignatureArgs): VerifySignatureResult {
  if (args.signatureHeader === null || args.signatureHeader === undefined) {
    return { ok: false, reason: 'missing X-Hub-Signature-256 header' };
  }
  if (!args.signatureHeader.startsWith(HEADER_PREFIX)) {
    return { ok: false, reason: 'header has unexpected prefix' };
  }
  const provided = args.signatureHeader.slice(HEADER_PREFIX.length);
  // Hex-encoded SHA-256 is 64 chars. Bail early on shape mismatch
  // before doing the expensive HMAC.
  if (provided.length !== 64) {
    return { ok: false, reason: 'signature length mismatch' };
  }
  const expected = createHmac('sha256', args.appSecret).update(args.rawBody).digest('hex');
  // Constant-time compare. Both buffers are exactly 64 bytes.
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
