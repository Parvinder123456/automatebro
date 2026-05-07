/**
 * Spec 026 — POST /api/v1/webhooks/whatsapp — WhatsApp webhook ingest.
 * Spec 026 — GET  /api/v1/webhooks/whatsapp — Meta verification handshake.
 *
 * Mirror of /api/v1/webhooks/meta but for WhatsApp. Critical: this route
 * is PUBLIC (no auth cookie). HMAC-SHA256 signature verification is the
 * only gate. Bad signature → 401 immediately, no DB write.
 *
 * Same `META_APP_SECRET` is used as the HMAC key because the WhatsApp
 * product lives under the same Meta App as our existing IG product
 * (per spec 026 §3.1 — webhook isolation by URL, not by app secret).
 *
 * Middleware bypasses session work for /api/v1/webhooks/* via
 * shouldSkipSession() in lib/auth/public-paths.
 */
import { loadEnv } from '@automatebro/shared/env';
import { ingestWhatsappWebhook } from '@automatebro/shared/handlers/webhooks/ingestWhatsappWebhook';
import { logger } from '@automatebro/shared/logger';
import { verifyMetaSignature } from '@automatebro/shared/meta/verifySignature';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    logger.warn('whatsapp webhook: handshake failed — wrong verify_token');
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read raw body BEFORE any JSON parsing — signature verification needs
  // byte-exact bytes. request.json() consumes the stream irreversibly.
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
      'whatsapp webhook: signature verification failed — rejecting 401',
    );
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'whatsapp webhook: malformed JSON in verified body',
    );
    return NextResponse.json({ error: 'bad_request', message: 'malformed JSON' }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof ingestWhatsappWebhook>>;
  try {
    result = await ingestWhatsappWebhook(payload);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'whatsapp webhook: ingest threw',
    );
    // 5xx triggers Meta retry — that's what we want here.
    return NextResponse.json(
      { error: 'internal', message: 'ingest failed; will be retried' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    parsed: result.parsed,
    inserted: result.inserted,
    duplicates: result.duplicates,
    errors: result.errors,
  });
}
