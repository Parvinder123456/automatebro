/**
 * POST /api/v1/auth/whatsapp/manual-connect — connect a WhatsApp Business
 * Account via manual token paste (v1 flow per spec 026 §9 Q1).
 *
 * Body: { wabaId, phoneNumberId, accessToken }
 * Returns: connected account summary (no token material).
 *
 * Token is verified server-side by calling Meta's GET /{phone-number-id}
 * before any DB write. Invalid token → 400 with detail.
 */
import { connectWhatsapp } from '@automatebro/shared/handlers/whatsappAccounts/connectWhatsapp';
import { logger } from '@automatebro/shared/logger';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  wabaId: z.string().min(1, 'WABA ID is required'),
  phoneNumberId: z.string().min(1, 'Phone Number ID is required'),
  accessToken: z.string().min(20, 'Access token looks too short'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    );
  }
  if (ctx.tenantId === null) {
    return NextResponse.json(
      { error: 'no_tenant', message: 'Complete onboarding first.' },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Body must be valid JSON.' },
      { status: 400 },
    );
  }

  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_input',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      },
      { status: 400 },
    );
  }

  try {
    const account = await connectWhatsapp(parsed.data, ctx);
    return NextResponse.json({ ok: true, account });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Token verification failures or Meta-side mismatches arrive here.
    // 400 with detail so the form can surface it. Don't 500 — this is
    // user error, not server error.
    logger.warn({ err: message }, 'manual-connect: connectWhatsapp failed');
    return NextResponse.json({ error: 'connect_failed', message }, { status: 400 });
  }
}
