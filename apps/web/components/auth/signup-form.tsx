'use client';

import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';

/**
 * Spec 002 §6.1 — email + password signup form.
 * Spec 013 §3.1 — adds the required Terms / Privacy consent checkbox.
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
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Synchronous guard against double-submit (e.g. Enter pressed mid-flight).
  const submittingRef = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!consented) {
      setError('Please accept the Terms and Privacy Policy.');
      return;
    }
    submittingRef.current = true;
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
      submittingRef.current = false;
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }

    // Hard navigation so the next page sees fresh server state.
    window.location.href = '/verify';
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="signup-form"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
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
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          required
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-1"
          data-testid="signup-consent"
        />
        <span>
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      {error !== null && (
        <p className="text-sm text-red-600" data-testid="signup-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !hydrated || !consented}
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
