/**
 * Spec 003 §8.3 — tenant gate for /app/* and /onboarding.
 *
 * Server Component layout. Reads the current pathname (set by
 * middleware as `x-pathname` header) and decides:
 *   - No session            → /login (belt + braces; middleware should
 *                              already have caught this)
 *   - Session + no tenant + path !== /onboarding → /onboarding
 *   - Session + tenant + path === /onboarding   → /app/dashboard
 *   - Otherwise pass through.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
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

  return <>{children}</>;
}
