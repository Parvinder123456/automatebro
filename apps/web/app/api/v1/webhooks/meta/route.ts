import { loadEnv } from '@automatebro/shared/env';
import { ingestMetaWebhook } from '@automatebro/shared/handlers/webhooks/ingestMetaWebhook';
import { logger } from '@automatebro/shared/logger';
import { verifyMetaSignature } from '@automatebro/shared/meta/verifySignature';
/**
 * Spec 005 — POST /api/v1/webhooks/meta — Meta webhook ingest.
 * Spec 005 — GET /api/v1/webhooks/meta — Meta verification handshake.
 *
 * Critical: this route is PUBLIC (no auth cookie). Signature verification
 * via HMAC-SHA256 is the only gate. Bad signature → 401 immediately.
 *
 * Middleware bypasses session work for /api/v1/webhooks/* via
 * shouldSkipSession() in lib/auth/public-paths.
 */
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET handshake. Meta sends this once when the webhook URL is registered.
 * We verify the verify_token and echo the challenge back as plain text.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || token === null || challenge === null) {
    return NextResponse.json(
      { error: 'bad_request', message: 'missing hub.* params' },
      { status: 400 },
    );
  }

  const env = loadEnv();
  if (token !== env.META_WEBHOOK_VERIFY_TOKEN) {
    logger.warn('meta webhook: handshake failed — wrong verify_token');
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Plain-text body containing the challenge — Meta expects exactly this.
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

/**
 * POST ingest. Verifies HMAC-SHA256 over the raw body before any
 * downstream work.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read the raw body once. We CANNOT use request.json() here because
  // signature verification requires byte-exact body, and once .json()
  // consumes the stream, .text() returns empty.
  const rawBody = await request.text();

  const env = loadEnv();
  const verification = verifyMetaSignature({
    rawBody,
    signatureHeader: request.headers.get('x-hub-signature-256'),
    appSecret: env.META_APP_SECRET,
  });
  if (!verification.ok) {
    logger.warn(
      { reason: verification.reason },
      'meta webhook: signature verification failed — rejecting 401',
    );
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'meta webhook: malformed JSON in verified body',
    );
    return NextResponse.json({ error: 'bad_request', message: 'malformed JSON' }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof ingestMetaWebhook>>;
  try {
    result = await ingestMetaWebhook(payload);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'meta webhook: ingest threw',
    );
    // Meta retries on 5xx — that's exactly what we want here.
    return NextResponse.json(
      { error: 'internal', message: 'ingest failed; will be retried' },
      { status: 500 },
    );
  }

  // TODO (spec 006): enqueue processing jobs for each result.events entry.

  // Always 200 to Meta unless processing fundamentally broke. Duplicates
  // are a normal occurrence (retries) — not an error.
  return NextResponse.json({
    ok: true,
    parsed: result.parsed,
    inserted: result.inserted,
    duplicates: result.duplicates,
    errors: result.errors,
  });
}
