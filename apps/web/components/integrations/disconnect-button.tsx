'use client';

import { useRef, useState } from 'react';

/**
 * Spec 004 — disconnect an Instagram account. Client component because
 * we DELETE via fetch and need to handle the loading/error states + a
 * confirm prompt.
 */
export function DisconnectButton({ accountId }: { accountId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleClick(): Promise<void> {
    if (submittingRef.current) return;
    if (!confirm('Disconnect this Instagram account? You can reconnect later.')) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const response = await fetch(`/api/v1/igAccounts/${accountId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        alert(`Could not disconnect: ${body.message ?? response.status}`);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      // Hard reload so the server-rendered list refreshes.
      window.location.reload();
    } catch (err) {
      alert(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="rounded border px-3 py-1 text-sm text-red-600 disabled:opacity-50"
      data-testid="disconnect-button"
    >
      {submitting ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
