'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { safeRedirectPath } from '../../lib/auth/public-paths';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';

/**
 * Spec 002 §6.2 — email + password login form. On success, redirects
 * to ?returnTo (if set by middleware) or /app. The returnTo value is
 * sanitised against open-redirect attacks via safeRedirectPath.
 */
export function LoginForm() {
  const params = useSearchParams();
  const returnTo = safeRedirectPath(params.get('returnTo'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guard against double-submit when Enter is pressed mid-flight.
  const submittingRef = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError !== null) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(signInError.message);
      return;
    }
    // Force a server round-trip so middleware sees the new cookie.
    window.location.href = returnTo;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </div>
      {error !== null && (
        <p className="text-sm text-red-600" data-testid="login-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        data-testid="login-submit"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex justify-between text-sm">
        <a href="/forgot-password" className="underline">
          Forgot password?
        </a>
        <a href="/signup" className="underline">
          Create account
        </a>
      </div>
    </form>
  );
}
