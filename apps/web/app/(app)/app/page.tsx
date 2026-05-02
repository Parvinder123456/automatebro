/**
 * /app — placeholder for spec 002.
 *
 * Spec 003 will add tenant-detection logic here:
 *   - if user has a tenant → redirect to /app/dashboard
 *   - if not → redirect to /onboarding
 *
 * For spec 002 with no tenant logic registered, we always redirect to
 * /onboarding so a freshly-signed-up user reaches a known landing page.
 */
import { redirect } from 'next/navigation';

export default function AppPage(): never {
  redirect('/onboarding');
}
