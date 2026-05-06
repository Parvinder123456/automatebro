/**
 * Meta Data Deletion Callback — POST /api/v1/privacy/callback
 *
 * When a user removes BloomDM from their Facebook/Instagram settings,
 * Meta sends a signed_request to this endpoint. We return a
 * confirmation_code and a status_url where Meta (or the user) can
 * check deletion status.
 *
 * Ref: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
import { createHmac } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_SECRET = process.env.META_APP_SECRET ?? '';

interface SignedPayload {
  user_id: string;
  algorithm: string;
  issued_at: number;
}

function parseSignedRequest(signedRequest: string): SignedPayload | null {
  const [encodedSig, payload] = signedRequest.split('.', 2);
  if (!encodedSig || !payload) return null;

  // Base64url → base64
  const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const data = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  const expected = createHmac('sha256', APP_SECRET).update(payload).digest();
  if (!sig.equals(expected)) return null;

  try {
    return JSON.parse(data.toString('utf8')) as SignedPayload;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (APP_SECRET === '') {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  let signedRequest: string;
  try {
    const formData = await request.formData();
    signedRequest = formData.get('signed_request') as string;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (!signedRequest) {
    return NextResponse.json({ error: 'missing_signed_request' }, { status: 400 });
  }

  const parsed = parseSignedRequest(signedRequest);
  if (parsed === null) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  // Generate a confirmation code from the user_id + timestamp
  const confirmationCode = createHmac('sha256', APP_SECRET)
    .update(`delete:${parsed.user_id}:${Date.now()}`)
    .digest('hex')
    .slice(0, 16);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bloomdm.in';
  const statusUrl = `${siteUrl}/deleted?code=${confirmationCode}`;

  return NextResponse.json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
}
