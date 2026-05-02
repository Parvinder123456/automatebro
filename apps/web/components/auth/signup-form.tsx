'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';

/**
 * Spec 002 §6.1 — email + password signup form.
 *
 * On submit: signUp() with emailRedirectTo pointed at our callback.
 * Supabase sends a verification email; user clicks the link → callback
 * exchanges the token → cookie set → redirect to /app.
 *
 * Until verified, the user can't sign in (Supabase rejects unverified
 * email logins when "Confirm email" is ON).
 */
export function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/v1/auth/callback?next=/app`,
      },
    });

    if (signUpError !== null) {
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }

    // Hard navigation so the next page sees fresh server state.
    window.location.href = '/verify';
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="signup-form">
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </div>
      {error !== null && (
        <p className="text-sm text-red-600" data-testid="signup-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        data-testid="signup-submit"
      >
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-sm">
        Already have an account?{' '}
        <a href="/login" className="underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
