'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface IgAccountOption {
  _id: string;
  igUsername: string;
}

type TriggerType = 'comment' | 'dm';
type IntentLabel = 'buying' | 'support' | 'spam' | 'other';
const INTENT_OPTIONS: Array<{ value: IntentLabel; label: string; hint: string }> = [
  { value: 'buying', label: 'Buying', hint: 'Purchase intent — "how much?", "in stock?", etc.' },
  { value: 'support', label: 'Support', hint: 'Questions or issues about an order/product.' },
  { value: 'spam', label: 'Spam', hint: 'Promo links, scams, off-topic noise.' },
  { value: 'other', label: 'Other', hint: 'Greetings, compliments, ambiguous chatter.' },
];

export function AutomationForm({
  igAccounts,
}: {
  igAccounts: IgAccountOption[];
}) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Spec 015 — local state so the form copy can adapt to which trigger
  // is selected (DMs aren't post-bound, comments mention "your post or reel").
  const [trigger, setTrigger] = useState<TriggerType>('comment');
  // Spec 016 — optional intent gate. Empty set = "any intent" (default).
  const [selectedIntents, setSelectedIntents] = useState<Set<IntentLabel>>(new Set());
  const submittingRef = useRef(false);

  function toggleIntent(label: IntentLabel): void {
    setSelectedIntents((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const keywords = (fd.get('keywords') as string)
      .split('\n')
      .map((k) => k.trim())
      .filter(Boolean);

    const intentList = Array.from(selectedIntents);
    const body = {
      igAccountId: fd.get('igAccountId') as string,
      name: fd.get('name') as string,
      // Spec 015 — explicitly send trigger; the API still defaults to
      // 'comment' if absent (backwards compat) but every new automation
      // from this form declares its trigger.
      trigger,
      keywords,
      // Spec 016 — only send intents when at least one is selected;
      // otherwise leave it null/undefined so the trigger is "any intent".
      ...(intentList.length > 0 ? { intents: intentList } : {}),
      response: {
        mode: 'static' as const,
        template: fd.get('template') as string,
      },
    };

    const res = await fetch('/api/v1/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.push('/app/automations');
    } else {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="automation-form"
      data-hydrated={hydrated ? 'true' : 'false'}
      className="max-w-lg space-y-4"
    >
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="igAccountId" className="block text-sm font-medium">
          Instagram account
        </label>
        <select
          id="igAccountId"
          name="igAccountId"
          required
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        >
          {igAccounts.map((a) => (
            <option key={a._id} value={a._id}>
              @{a.igUsername}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="rounded border p-3" data-testid="trigger-selector">
        <legend className="px-1 text-sm font-medium">Trigger — when to fire</legend>
        <label className="flex items-start gap-2 py-2 text-sm">
          <input
            type="radio"
            name="trigger"
            value="comment"
            checked={trigger === 'comment'}
            onChange={() => setTrigger('comment')}
            data-testid="trigger-option-comment"
          />
          <span>
            <span className="font-medium">User comments on your post or reel</span>
            <br />
            <span className="text-xs text-gray-600">
              Auto-DM commenters whose comment matches a keyword.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 py-2 text-sm">
          <input
            type="radio"
            name="trigger"
            value="dm"
            checked={trigger === 'dm'}
            onChange={() => setTrigger('dm')}
            data-testid="trigger-option-dm"
          />
          <span>
            <span className="font-medium">User DMs you</span>
            <br />
            <span className="text-xs text-gray-600">
              Auto-reply to inbound DMs whose text matches a keyword.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 py-2 text-sm opacity-50">
          <input type="radio" disabled aria-disabled="true" />
          <span>
            <span className="font-medium">User replies to your stories</span>
            <br />
            <span className="text-xs text-gray-600">Coming soon — pending Meta App Review.</span>
          </span>
        </label>
      </fieldset>

      <div>
        <label htmlFor="keywords" className="block text-sm font-medium">
          Keywords
        </label>
        <textarea
          id="keywords"
          name="keywords"
          required
          rows={3}
          placeholder={
            trigger === 'dm'
              ? 'One keyword per line. Match is case-insensitive against the DM text.'
              : 'One keyword per line. Match is case-insensitive against the comment text.'
          }
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="rounded border p-3" data-testid="intent-filter">
        <legend className="px-1 text-sm font-medium">Intent filter (optional)</legend>
        <p className="mb-2 text-xs text-gray-600">
          Only fire when AI classifies the inbound text as one of these. Leave all unchecked to fire
          on any intent (default).
        </p>
        <div className="grid grid-cols-2 gap-2">
          {INTENT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-2 rounded border p-2 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedIntents.has(opt.value)}
                onChange={() => toggleIntent(opt.value)}
                data-testid={`intent-option-${opt.value}`}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{opt.label}</span>
                <br />
                <span className="text-xs text-gray-600">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="template" className="block text-sm font-medium">
          Reply template
        </label>
        <textarea
          id="template"
          name="template"
          required
          rows={3}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={!hydrated || submitting}
        data-testid="automation-submit"
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create automation'}
      </button>
    </form>
  );
}
