/**
 * Spec 003 §8.3 — tenant gate for /app/* and /onboarding.
 * Spec 011 §3.3 — adds the sidebar shell when the gate passes and we're
 * not on /onboarding (which keeps a bare layout).
 *
 * Server Component layout. Reads the current pathname (set by
 * middleware as `x-pathname` header) and decides:
 *   - No session            → /login (belt + braces; middleware should
 *                              already have caught this)
 *   - Session + no tenant + path !== /onboarding → /onboarding
 *   - Session + tenant + path === /onboarding   → /app/dashboard
 *   - Otherwise pass through.
 */
import { getDb } from '@automatebro/shared/db/client';
import type { Tenant } from '@automatebro/shared/types/tenant';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from '../../components/app-shell/sidebar';
import { getCtx } from '../../lib/auth/get-ctx';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getCtx();
  if (ctx === null) {
    redirect('/login');
  }

  const headerList = await headers();
  const pathname = headerList.get('x-pathname');
  // Middleware sets this header on every request that reaches a layout.
  // If it's missing, middleware was bypassed somehow (misconfiguration,
  // direct invocation in tests, etc.). Fail safe: redirect to /login
  // rather than guess the routing decision.
  if (pathname === null) {
    redirect('/login');
  }

  const onOnboarding = pathname === '/onboarding';
  const hasTenant = ctx.tenantId !== null;

  if (!hasTenant && !onOnboarding) {
    redirect('/onboarding');
  }
  if (hasTenant && onOnboarding) {
    redirect('/app/dashboard');
  }

  // /onboarding keeps the bare layout (no sidebar, no chrome).
  if (onOnboarding) {
    return <>{children}</>;
  }

  // /app/* gets the sidebar shell. Look up workspace name once for the header.
  const db = await getDb();
  const tenant =
    ctx.tenantId !== null
      ? await db.queryOne<Tenant>('tenants', { _id: ctx.tenantId })
      : null;
  const workspaceName = tenant?.name ?? 'Workspace';

  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceName={workspaceName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
