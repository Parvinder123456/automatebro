'use client';

import { useRouter } from 'next/navigation';
/**
 * Spec 026 — manual-token-paste connect form.
 *
 * Tenant pastes (wabaId, phoneNumberId, accessToken). Form posts to
 * /api/v1/auth/whatsapp/manual-connect; server-side handler verifies
 * with Meta before any DB write. On success, redirect to /app/whatsapp.
 *
 * Uses CLAUDE.md spec 011 patterns:
 *  - data-hydrated="true" sentinel so E2E waits for hydration
 *  - useRef synchronous double-submit guard
 *  - submit disabled until all 3 fields populated
 */
import { type FormEvent, useEffect, useRef, useState } from 'react';

export function ConnectForm() {
  const router = useRouter();
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => setHydrated(true), []);

  const allFilled =
    wabaId.trim() !== '' && phoneNumberId.trim() !== '' && accessToken.trim() !== '';

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!allFilled) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/whatsapp/manual-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wabaId: wabaId.trim(),
          phoneNumberId: phoneNumberId.trim(),
          accessToken: accessToken.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? `Connect failed (${res.status})`);
        return;
      }
      router.push('/app/whatsapp');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      data-testid="whatsapp-connect-form"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <div>
        <label htmlFor="wabaId" className="block text-sm font-medium">
          WhatsApp Business Account ID
        </label>
        <p className="mt-0.5 text-xs text-gray-600">
          Find in Meta Business Manager → WhatsApp Accounts → Settings.
        </p>
        <input
          id="wabaId"
          name="wabaId"
          type="text"
          value={wabaId}
          onChange={(e) => setWabaId(e.target.value)}
          required
          className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
          placeholder="123456789012345"
        />
      </div>

      <div>
        <label htmlFor="phoneNumberId" className="block text-sm font-medium">
          Phone Number ID
        </label>
        <p className="mt-0.5 text-xs text-gray-600">
          Meta App Dashboard → WhatsApp → API Setup → "Phone number ID".
        </p>
        <input
          id="phoneNumberId"
          name="phoneNumberId"
          type="text"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          required
          className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
          placeholder="987654321098765"
        />
      </div>

      <div>
        <label htmlFor="accessToken" className="block text-sm font-medium">
          System User Access Token
        </label>
        <p className="mt-0.5 text-xs text-gray-600">
          Meta Business → System Users → Generate token (permanent). We encrypt before storage; you
          can rotate any time.
        </p>
        <textarea
          id="accessToken"
          name="accessToken"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          required
          rows={3}
          className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
          placeholder="EAAB…"
        />
      </div>

      {error !== null && (
        <div
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
          data-testid="whatsapp-connect-error"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!hydrated || submitting || !allFilled}
        data-testid="whatsapp-connect-submit"
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Verifying with Meta…' : 'Connect WhatsApp'}
      </button>
    </form>
  );
}
