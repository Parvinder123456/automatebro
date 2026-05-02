/**
 * /app — redirects authenticated users to their dashboard.
 *
 * The (app)/layout.tsx already gates on tenant existence:
 *   - No tenant → /onboarding
 *   - Has tenant → renders this page → which redirects to /app/dashboard
 *
 * This page is therefore only reached by users WITH a tenant (the
 * layout would have redirected to /onboarding otherwise).
 */
import { redirect } from 'next/navigation';

export default function AppPage(): never {
  redirect('/app/dashboard');
}
