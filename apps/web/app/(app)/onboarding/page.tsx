import { WorkspaceForm } from '../../../components/onboarding/workspace-form';
import { getCtx } from '../../../lib/auth/get-ctx';

export const metadata = { title: 'Welcome — BloomDM' };

/**
 * Spec 003 — onboarding. Shows the workspace-name form.
 *
 * The (app)/layout.tsx redirects users who already have a tenant to
 * /app/dashboard before this page renders, so we can assume the user
 * is in pre-tenant state when the page is shown.
 */
export default async function OnboardingPage() {
  const ctx = await getCtx();

  return (
    <main className="mx-auto max-w-md p-8" data-testid="onboarding-page">
      <h1 className="mb-2 text-3xl font-semibold">Welcome to BloomDM</h1>
      <p className="mb-6 text-sm text-gray-600">
        Signed in as <strong>{ctx?.email ?? 'unknown'}</strong>. Pick a name for your workspace to
        get started.
      </p>
      <WorkspaceForm />
      <form action="/logout" method="POST" className="mt-6">
        <button type="submit" className="text-xs text-gray-500 underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
