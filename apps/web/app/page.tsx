import type { ReactElement } from 'react';

export default function HomePage(): ReactElement {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-bold mb-4">AutomateBro</h1>
        <p className="text-lg text-gray-600">
          Instagram DM automation for Indian creators. Coming soon.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <a
            href="/signup"
            className="rounded bg-black px-5 py-2 text-white"
            data-testid="cta-signup"
          >
            Create account
          </a>
          <a href="/login" className="rounded border px-5 py-2" data-testid="cta-login">
            Sign in
          </a>
        </div>
        <p className="mt-8 text-sm text-gray-500">
          Health check:{' '}
          <a className="underline" href="/api/v1/health">
            /api/v1/health
          </a>
        </p>
      </div>
    </main>
  );
}
