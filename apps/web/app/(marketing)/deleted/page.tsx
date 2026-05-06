import type { Metadata } from 'next';

/**
 * Spec 013 §3.4 — landing page for users whose workspace is soft-deleted.
 *
 * Public route (allow-listed in `apps/web/lib/auth/public-paths.ts`)
 * because the user might land here after the auth cookies have been
 * cleared on logout. Pure static — no DB call.
 */
export const metadata: Metadata = {
  title: 'Workspace deleted',
  description: 'Your BloomDM workspace is scheduled for deletion.',
  robots: { index: false, follow: false },
};

export default function DeletedPage() {
  return (
    <article className="mx-auto max-w-xl px-6 py-20" data-testid="deleted-page">
      <h1 className="mb-3 text-3xl font-bold">Your workspace is scheduled for deletion</h1>
      <p className="mb-4 text-gray-700">
        We&apos;ve received your deletion request and your workspace is now invisible to you and
        your team. All connected Instagram accounts have been disconnected on BloomDM&apos;s
        side.
      </p>
      <p className="mb-4 text-gray-700">
        Your data will be permanently deleted from our systems <strong>30 days from now</strong>.
        After that, recovery is not possible.
      </p>
      <h2 className="mb-2 mt-8 text-xl font-semibold">Changed your mind?</h2>
      <p className="mb-4 text-gray-700">
        Email{' '}
        <a className="underline" href="mailto:parvinderawal@gmail.com">
          parvinderawal@gmail.com
        </a>{' '}
        from the same email address you signed up with, before the 30-day window closes, and
        we&apos;ll restore your workspace.
      </p>
      <h2 className="mb-2 mt-8 text-xl font-semibold">Already revoked Meta?</h2>
      <p className="mb-4 text-gray-700">
        BloomDM stops sending DMs immediately on deletion. If you also want to revoke
        Meta&apos;s permission for BloomDM, you can do so from your{' '}
        <a
          className="underline"
          href="https://www.facebook.com/settings?tab=business_tools"
          target="_blank"
          rel="noopener noreferrer"
        >
          Facebook Business Integrations
        </a>{' '}
        settings.
      </p>
      <div className="mt-8 flex gap-3">
        <a href="/" className="rounded border px-5 py-2 text-sm hover:bg-gray-50">
          Back to home
        </a>
        <a
          href="/signup"
          className="rounded bg-black px-5 py-2 text-sm text-white hover:opacity-90"
        >
          Start a new workspace
        </a>
      </div>
    </article>
  );
}
