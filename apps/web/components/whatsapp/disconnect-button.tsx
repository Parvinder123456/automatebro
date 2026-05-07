'use client';

import { useRouter } from 'next/navigation';
/**
 * Spec 026 — client-side disconnect button.
 *
 * Calls DELETE /api/v1/whatsapp/accounts/[id]. Includes a confirm
 * dialog (browser native — minimal but adequate for v1) and a
 * synchronous double-submit guard via useRef per CLAUDE.md spec 011
 * lessons. Refreshes the page on success.
 */
import { useRef, useState } from 'react';

export function DisconnectButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  async function onClick(): Promise<void> {
    if (submittingRef.current) return;
    if (!window.confirm('Disconnect this WhatsApp account? You can reconnect later.')) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/whatsapp/accounts/${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.message ?? 'Disconnect failed.');
        return;
      }
      router.refresh();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitting}
      data-testid="whatsapp-disconnect"
      className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
    >
      {submitting ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
