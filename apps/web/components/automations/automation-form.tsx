'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PostPicker } from './post-picker';

interface IgAccountOption {
  _id: string;
  igUsername: string;
}

interface WhatsappAccountOption {
  _id: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  disconnectedAt: Date | null;
}

interface WhatsappTemplateOption {
  _id: string;
  whatsappAccountId: string;
  name: string;
  language: string;
  variableCount: number;
}

type TriggerType = 'comment' | 'dm' | 'whatsappMessage';
type IntentLabel = 'buying' | 'support' | 'spam' | 'other';
const INTENT_OPTIONS: Array<{ value: IntentLabel; label: string; hint: string }> = [
  { value: 'buying', label: 'Buying', hint: 'Purchase intent — "how much?", "in stock?", etc.' },
  { value: 'support', label: 'Support', hint: 'Questions or issues about an order/product.' },
  { value: 'spam', label: 'Spam', hint: 'Promo links, scams, off-topic noise.' },
  { value: 'other', label: 'Other', hint: 'Greetings, compliments, ambiguous chatter.' },
];

export function AutomationForm({
  igAccounts,
  whatsappAccounts = [],
  whatsappTemplates = [],
}: {
  igAccounts: IgAccountOption[];
  // Spec 026 — optional WA accounts + approved templates. Defaults
  // empty so existing IG-only callers continue to work unchanged.
  whatsappAccounts?: WhatsappAccountOption[];
  whatsappTemplates?: WhatsappTemplateOption[];
}) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [trigger, setTrigger] = useState<TriggerType>('comment');
  const [selectedIntents, setSelectedIntents] = useState<Set<IntentLabel>>(new Set());
  const [igAccountId, setIgAccountId] = useState<string>(igAccounts[0]?._id ?? '');
  const activeWaAccounts = useMemo(
    () => whatsappAccounts.filter((a) => a.disconnectedAt === null),
    [whatsappAccounts],
  );
  const [whatsappAccountId, setWhatsappAccountId] = useState<string>(
    activeWaAccounts[0]?._id ?? '',
  );
  const [whatsappTemplateId, setWhatsappTemplateId] = useState<string>('');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [matchAny, setMatchAny] = useState(false);
  const submittingRef = useRef(false);

  // When tenant switches WA account, clear template selection (templates
  // are scoped per account). The dep is intentional — we want this to
  // re-run on every account change, not just on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run-on-change is the goal
  useEffect(() => {
    setWhatsappTemplateId('');
  }, [whatsappAccountId]);

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

  const isWhatsapp = trigger === 'whatsappMessage';
  const waAvailable = activeWaAccounts.length > 0;
  const templatesForAccount = whatsappTemplates.filter(
    (t) => t.whatsappAccountId === whatsappAccountId,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const template = ((fd.get('template') as string) ?? '').trim();
    const commentReply =
      trigger === 'comment' ? ((fd.get('commentReply') as string) ?? '').trim() : '';

    if (trigger === 'comment' && template === '' && commentReply === '') {
      submittingRef.current = false;
      setSubmitting(false);
      alert('Fill in at least one of DM template or comment reply.');
      return;
    }
    if (isWhatsapp && template === '' && whatsappTemplateId === '') {
      submittingRef.current = false;
      setSubmitting(false);
      alert('Provide either a freeform reply (in-window) or pick an approved template.');
      return;
    }

    const keywords = matchAny
      ? []
      : (fd.get('keywords') as string)
          .split('\n')
          .map((k) => k.trim())
          .filter(Boolean);

    const intentList = Array.from(selectedIntents);
    const body: Record<string, unknown> = {
      name: fd.get('name') as string,
      trigger,
      keywords,
      ...(intentList.length > 0 ? { intents: intentList } : {}),
    };

    if (isWhatsapp) {
      body.whatsappAccountId = whatsappAccountId;
      body.response = {
        mode: 'static' as const,
        ...(template !== '' ? { template } : {}),
        ...(whatsappTemplateId !== '' ? { whatsappTemplateId } : {}),
      };
    } else {
      body.igAccountId = igAccountId;
      if (trigger === 'comment' && selectedPostIds.length > 0) body.postIds = selectedPostIds;
      body.response = {
        mode: 'static' as const,
        ...(template !== '' ? { template } : {}),
        ...(commentReply !== '' ? { commentReply } : {}),
      };
    }

    const res = await fetch('/api/v1/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.push('/app/automations');
    } else {
      const errBody = await res.json().catch(() => ({}));
      alert(errBody.message ?? `Create failed (${res.status})`);
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

      {!isWhatsapp && (
        <div>
          <label htmlFor="igAccountId" className="block text-sm font-medium">
            Instagram account
          </label>
          <select
            id="igAccountId"
            name="igAccountId"
            required
            value={igAccountId}
            onChange={(e) => {
              setIgAccountId(e.target.value);
              setSelectedPostIds([]);
            }}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          >
            {igAccounts.map((a) => (
              <option key={a._id} value={a._id}>
                @{a.igUsername}
              </option>
            ))}
          </select>
        </div>
      )}

      {isWhatsapp && (
        <div>
          <label htmlFor="whatsappAccountId" className="block text-sm font-medium">
            WhatsApp account
          </label>
          <select
            id="whatsappAccountId"
            name="whatsappAccountId"
            required
            value={whatsappAccountId}
            onChange={(e) => setWhatsappAccountId(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            data-testid="whatsapp-account-select"
          >
            {activeWaAccounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.displayPhoneNumber}
                {a.verifiedName !== null ? ` (${a.verifiedName})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

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
            <span className="font-medium">User DMs you on Instagram</span>
            <br />
            <span className="text-xs text-gray-600">
              Auto-reply to inbound DMs whose text matches a keyword.
            </span>
          </span>
        </label>
        <label
          className="flex items-start gap-2 py-2 text-sm opacity-50"
          data-testid="trigger-option-storyReply"
        >
          <input type="radio" disabled aria-disabled="true" />
          <span>
            <span className="font-medium">User replies to your stories</span>
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800">
              Beta
            </span>
            <br />
            <span className="text-xs text-gray-600">
              Backend ready — pending Meta App Review approval for{' '}
              <code className="rounded bg-gray-100 px-1">instagram_manage_messages</code>.
            </span>
          </span>
        </label>
        <label
          className={`flex items-start gap-2 py-2 text-sm ${waAvailable ? '' : 'opacity-50'}`}
          data-testid="trigger-option-whatsappMessage"
        >
          <input
            type="radio"
            name="trigger"
            value="whatsappMessage"
            checked={trigger === 'whatsappMessage'}
            disabled={!waAvailable}
            onChange={() => setTrigger('whatsappMessage')}
          />
          <span>
            <span className="font-medium">User messages your WhatsApp</span>
            <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-800">
              New
            </span>
            <br />
            <span className="text-xs text-gray-600">
              {waAvailable
                ? 'Auto-reply on WhatsApp when someone messages your business number with a matching keyword.'
                : 'Connect a WhatsApp account first — Settings → WhatsApp.'}
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={matchAny}
            onChange={(e) => setMatchAny(e.target.checked)}
            data-testid="match-any-toggle"
          />
          Fire on any{' '}
          {trigger === 'dm' ? 'DM' : trigger === 'whatsappMessage' ? 'WhatsApp message' : 'comment'}{' '}
          (no keyword filter)
        </label>
        {!matchAny && (
          <>
            <label htmlFor="keywords" className="mt-3 block text-sm font-medium">
              Keywords
            </label>
            <textarea
              id="keywords"
              name="keywords"
              required
              rows={3}
              placeholder="One keyword per line. Match is case-insensitive."
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </>
        )}
      </div>

      {trigger === 'comment' && (
        <div className="rounded border p-3" data-testid="post-picker-section">
          <p className="mb-2 text-sm font-medium">Posts (optional)</p>
          <p className="mb-3 text-xs text-gray-600">
            Restrict the automation to specific posts/reels. Leave empty to fire on any post.
          </p>
          <PostPicker
            igAccountId={igAccountId}
            selected={selectedPostIds}
            onChange={setSelectedPostIds}
            disabled={igAccountId === ''}
          />
        </div>
      )}

      {!isWhatsapp && (
        <fieldset className="rounded border p-3" data-testid="intent-filter">
          <legend className="px-1 text-sm font-medium">Intent filter (optional)</legend>
          <p className="mb-2 text-xs text-gray-600">
            Only fire when AI classifies the inbound text as one of these. Leave all unchecked to
            fire on any intent (default).
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
      )}

      <div>
        <label htmlFor="template" className="block text-sm font-medium">
          {trigger === 'comment'
            ? 'DM template (optional if comment reply is set)'
            : isWhatsapp
              ? 'Freeform reply (in 24h service window)'
              : 'Reply template'}
        </label>
        {isWhatsapp && (
          <p className="mt-0.5 text-xs text-gray-600">
            Sent when the customer is in the 24h service window. Outside the window, the approved
            template below is used (if set).
          </p>
        )}
        <textarea
          id="template"
          name="template"
          required={trigger === 'dm'}
          rows={3}
          placeholder={
            trigger === 'comment'
              ? 'The private DM sent to the commenter. Use {username} for their name. Leave empty for comment-reply only.'
              : isWhatsapp
                ? 'Hi {username}! Thanks for messaging. — leave empty if you only want template replies.'
                : 'The reply sent to the user. Use {username} for their name.'
          }
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      {isWhatsapp && (
        <div>
          <label htmlFor="whatsappTemplateId" className="block text-sm font-medium">
            Approved template (out-of-window) <span className="text-gray-500">(optional)</span>
          </label>
          <p className="mt-0.5 text-xs text-gray-600">
            Used when the recipient is outside the 24h service window. Only Meta-approved templates
            are listed.
          </p>
          <select
            id="whatsappTemplateId"
            name="whatsappTemplateId"
            value={whatsappTemplateId}
            onChange={(e) => setWhatsappTemplateId(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            data-testid="whatsapp-template-select"
          >
            <option value="">— None (freeform-only) —</option>
            {templatesForAccount.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} ({t.language})
                {t.variableCount > 0
                  ? ` · ${t.variableCount} variable${t.variableCount > 1 ? 's' : ''}`
                  : ''}
              </option>
            ))}
          </select>
          {templatesForAccount.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              No approved templates yet for this account.{' '}
              <a className="underline" href="/app/whatsapp/templates/new">
                Create one
              </a>
              .
            </p>
          )}
        </div>
      )}

      {trigger === 'comment' && (
        <div>
          <label htmlFor="commentReply" className="block text-sm font-medium">
            Comment reply (optional if DM template is set)
          </label>
          <p className="mt-0.5 text-xs text-gray-600">
            Public reply posted under the comment. Fill in at least one of DM template or comment
            reply.
          </p>
          <textarea
            id="commentReply"
            name="commentReply"
            rows={2}
            placeholder="e.g. Check your DMs, @{username}!"
            data-testid="comment-reply-input"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
      )}

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
