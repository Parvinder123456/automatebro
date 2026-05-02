'use client';

import { useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser';

/**
 * Spec 002 §6.5 — set a new password. The recovery token arrives via
 * URL hash (handled internally by @supabase/ssr). User just submits a
 * new password.
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError !== null) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(updateError.message);
      return;
    }
    window.location.href = '/login?reset=success';
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="reset-password-form">
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          New password
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
      {error !== null && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Updating…' : 'Set new password'}
      </button>
    </form>
  );
}
