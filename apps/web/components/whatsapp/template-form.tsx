'use client';

import type { WhatsappAccountSummary } from '@automatebro/shared/handlers/whatsappAccounts/listWhatsappAccounts';
import { useRouter } from 'next/navigation';
/**
 * Spec 026 — template create form with live WhatsApp-style preview.
 *
 * Two columns: form on left, bubble preview on right. Variables
 * `{{1}}`, `{{2}}` rendered as inline placeholders in preview.
 */
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

const CATEGORIES = ['utility', 'marketing', 'authentication'] as const;
type Category = (typeof CATEGORIES)[number];

const LANGUAGES = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi_IN', label: 'Hindi (India)' },
  { code: 'mr_IN', label: 'Marathi (India)' },
  { code: 'ta_IN', label: 'Tamil (India)' },
];

function renderPreview(bodyText: string): string {
  // Replace {{N}} with a placeholder pill for the preview only.
  return bodyText.replaceAll(/\{\{(\d+)\}\}/g, '⟨$1⟩');
}

export function TemplateForm({
  accounts,
}: {
  accounts: ReadonlyArray<WhatsappAccountSummary>;
}) {
  const router = useRouter();
  const activeAccounts = accounts.filter((a) => a.disconnectedAt === null);
  const [whatsappAccountId, setWhatsappAccountId] = useState(activeAccounts[0]?._id ?? '');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('utility');
  const [language, setLanguage] = useState('en_US');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [submitToMeta, setSubmitToMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => setHydrated(true), []);

  const valid = useMemo(
    () =>
      whatsappAccountId !== '' &&
      /^[a-z0-9_]+$/.test(name) &&
      bodyText.trim().length > 0 &&
      bodyText.length <= 1024 &&
      footerText.length <= 60,
    [whatsappAccountId, name, bodyText, footerText],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submittingRef.current || !valid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappAccountId,
          name: name.trim(),
          category,
          language,
          bodyText,
          footerText: footerText.trim() === '' ? undefined : footerText.trim(),
          submitToMeta,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? `Create failed (${res.status})`);
        return;
      }
      router.push(`/app/whatsapp/templates/${body.template._id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (activeAccounts.length === 0) {
    return (
      <div
        className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        data-testid="template-form-no-accounts"
      >
        Connect a WhatsApp account before creating templates.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <form
        onSubmit={onSubmit}
        className="space-y-4"
        data-testid="template-form"
        data-hydrated={hydrated ? 'true' : 'false'}
      >
        {activeAccounts.length > 1 && (
          <div>
            <label htmlFor="whatsappAccountId" className="block text-sm font-medium">
              WhatsApp account
            </label>
            <select
              id="whatsappAccountId"
              value={whatsappAccountId}
              onChange={(e) => setWhatsappAccountId(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            >
              {activeAccounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.displayPhoneNumber} {a.verifiedName !== null ? `(${a.verifiedName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Template name
          </label>
          <p className="mt-0.5 text-xs text-gray-600">
            Lowercase letters, digits, underscores. e.g. <code>order_confirmation</code>
          </p>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            required
            className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
            placeholder="order_confirmation"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="category" className="block text-sm font-medium">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="mt-1 w-full rounded border px-3 py-2"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0]?.toUpperCase()}
                  {c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="language" className="block text-sm font-medium">
              Language
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="bodyText" className="block text-sm font-medium">
            Body text
          </label>
          <p className="mt-0.5 text-xs text-gray-600">
            Use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> for variables. Max 1024 chars.
          </p>
          <textarea
            id="bodyText"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            required
            rows={5}
            maxLength={1024}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            placeholder="Hi {{1}}, your order #{{2}} has been confirmed."
          />
          <div className="mt-1 text-xs text-gray-500">{bodyText.length} / 1024 characters</div>
        </div>

        <div>
          <label htmlFor="footerText" className="block text-sm font-medium">
            Footer (optional)
          </label>
          <p className="mt-0.5 text-xs text-gray-600">Max 60 chars. Plain text only.</p>
          <input
            id="footerText"
            type="text"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            maxLength={60}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={submitToMeta}
            onChange={(e) => setSubmitToMeta(e.target.checked)}
          />
          Submit to Meta for approval immediately
        </label>

        {error !== null && (
          <div
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
            data-testid="template-form-error"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!hydrated || submitting || !valid}
          data-testid="template-form-submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitToMeta ? 'Save + submit to Meta' : 'Save as draft'}
        </button>
      </form>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-gray-500">Preview</div>
        <div
          className="max-w-sm rounded-lg bg-[#dcf8c6] p-4 shadow-sm"
          data-testid="template-preview"
        >
          <div className="whitespace-pre-wrap text-sm text-gray-900">
            {bodyText.length > 0 ? (
              renderPreview(bodyText)
            ) : (
              <span className="text-gray-500 italic">Body text appears here</span>
            )}
          </div>
          {footerText.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">{renderPreview(footerText)}</div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Variables shown as ⟨1⟩, ⟨2⟩ — recipient sees actual values you provide when sending.
        </p>
      </div>
    </div>
  );
}
