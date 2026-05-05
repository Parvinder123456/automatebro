import {
  CreateTenantInput,
  createTenant,
  hasExistingTenant,
} from '@automatebro/shared/handlers/tenants/createTenant';
/**
 * POST /api/v1/tenants — create a workspace.
 *
 * Spec 003 §8.2. The user must be authenticated AND have no existing
 * tenant (one-shot onboarding in v1). Returns 409 on second-call.
 *
 * GET /api/v1/tenants/me — read the current user's tenant + role.
 * Used by the (app) layout to decide redirect vs. pass-through.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    );
  }

  // Body validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = CreateTenantInput.safeParse(body);
  if (!parsed.success) {
    // Tighten the message when the failure is the consent literal — it's
    // a common bot-attack vector to skip checkboxes, and we want the
    // operator-facing log to be specific.
    const flat = parsed.error.flatten();
    const consentError = flat.fieldErrors.processingConsent !== undefined;
    return NextResponse.json(
      {
        error: 'validation',
        message: consentError
          ? 'Processing consent is required.'
          : 'Workspace name is required (1–120 chars).',
        issues: flat,
      },
      { status: 400 },
    );
  }

  // One-shot enforcement
  if (await hasExistingTenant(ctx)) {
    return NextResponse.json(
      { error: 'tenant_exists', message: 'You already have a workspace.' },
      { status: 409 },
    );
  }

  try {
    const { tenant } = await createTenant(parsed.data, ctx);
    return NextResponse.json(
      { tenant: { _id: tenant._id, slug: tenant.slug, name: tenant.name } },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    // Concurrent POST race: hasExistingTenant() can pass for both
    // requests, but migration 002's UNIQUE(userId) on tenantUsers makes
    // the second insert fail with a Postgres unique violation
    // (SQLSTATE 23505 or message "duplicate key"). Surface as 409 so
    // the client sees the same error path as the explicit one-shot check.
    if (
      err instanceof Error &&
      (err.message.includes('23505') ||
        err.message.toLowerCase().includes('duplicate key') ||
        err.message.toLowerCase().includes('unique'))
    ) {
      return NextResponse.json(
        { error: 'tenant_exists', message: 'You already have a workspace.' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'create_failed', message: `Could not create workspace: ${message}` },
      { status: 500 },
    );
  }
}
