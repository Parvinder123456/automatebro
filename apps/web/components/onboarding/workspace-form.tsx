'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Spec 003 §8.1 — workspace-name form. Posts to /api/v1/tenants;
 * on 201 redirects to /app/dashboard.
 */
export function WorkspaceForm() {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const submittingRef = useRef(false);

  // Tests + race-condition defence: only enable submit after React
  // has bound onSubmit, so a fast click can't trigger a native form
  // submit (GET to current URL with form fields as query string).
  useEffect(() => {
    setHydrated(true);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSubmitting(true);

    let response: Response;
    try {
      response = await fetch('/api/v1/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Network error');
      return;
    }

    if (!response.ok) {
      submittingRef.current = false;
      setSubmitting(false);
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? `Server returned ${response.status}`);
      return;
    }

    // Hard nav so the (app) layout sees the new tenant.
    window.location.href = '/app/dashboard';
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="workspace-form"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <div>
        <label htmlFor="workspace-name" className="block text-sm font-medium">
          Workspace name
        </label>
        <input
          id="workspace-name"
          name="name"
          type="text"
          required
          minLength={1}
          maxLength={120}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Studio"
          className="mt-1 block w-full rounded border px-3 py-2"
        />
        <p className="mt-1 text-xs text-gray-500">You can change this later in Settings.</p>
      </div>
      {error !== null && (
        <p className="text-sm text-red-600" data-testid="workspace-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !hydrated}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        data-testid="workspace-submit"
      >
        {submitting ? 'Creating workspace…' : 'Create workspace'}
      </button>
    </form>
  );
}
