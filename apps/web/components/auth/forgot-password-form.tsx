'use client';

import { useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';

/**
 * Spec 002 §6.5 — request password-reset email.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    submittingRef.current = false;
    setSubmitting(false);

    if (resetError !== null) {
      setError(resetError.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-4" data-testid="forgot-password-success">
        <p>If an account exists for {email}, a reset link is on its way.</p>
        <a href="/login" className="underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="forgot-password-form">
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
      {error !== null && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
