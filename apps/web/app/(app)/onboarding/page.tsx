import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const metadata = { title: 'Welcome — AutomateBro' };

/**
 * Spec 002 — placeholder. Spec 003 turns this into a real workspace-name
 * form that creates a `tenants` row.
 */
export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-2xl p-8" data-testid="onboarding-page">
      <h1 className="mb-4 text-3xl font-semibold">Welcome to AutomateBro</h1>
      <p className="text-gray-700">
        You&apos;re signed in as <strong>{user?.email ?? 'unknown'}</strong>.
      </p>
      <p className="mt-4 text-gray-700">
        Spec 003 will replace this page with a workspace-name form that creates your tenant.
      </p>
      <form action="/logout" method="POST" className="mt-6">
        <button type="submit" className="rounded border px-4 py-2 text-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
