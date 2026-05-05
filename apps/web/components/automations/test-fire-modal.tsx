'use client';

import { useEffect, useRef, useState } from 'react';

interface PreviewResult {
  matched: boolean;
  matchReason: string;
  mode: 'static' | 'ai';
  renderedContent: string | null;
  renderedCommentReply: string | null;
}

interface TestFireModalProps {
  automationId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Spec 022 / Phase 4.5 — "Test fire" modal.
 *
 * Tenant types a sample comment/DM and we run the automation against
 * it WITHOUT sending. Shows whether keywords match + what the rendered
 * reply would be.
 *
 * Reuses the dialog pattern from delete-confirm-modal: div with
 * role=dialog (Tailwind-styled), Escape closes, focus the input on
 * open.
 */
export function TestFireModal({ automationId, open, onClose }: TestFireModalProps) {
  const [sampleText, setSampleText] = useState('');
  const [sampleUsername, setSampleUsername] = useState('sample_user');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setSampleText('');
      setResult(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submittingRef.current) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleFire(): Promise<void> {
    if (submittingRef.current) return;
    if (sampleText.trim() === '') {
      setError('Type a sample message first.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setResult(null);

    let response: Response;
    try {
      response = await fetch(`/api/v1/automations/${encodeURIComponent(automationId)}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleText, sampleUsername }),
      });
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Network error');
      return;
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      submittingRef.current = false;
      setSubmitting(false);
      setError(body.message ?? `Server returned ${response.status}`);
      return;
    }

    const data = (await response.json()) as PreviewResult;
    submittingRef.current = false;
    setSubmitting(false);
    setResult(data);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Tailwind-styled modal pattern (see CLAUDE.md spec 013 lessons)
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-fire-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="test-fire-modal"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 id="test-fire-title" className="text-lg font-semibold">
            Test fire automation
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
            data-testid="test-fire-close"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-xs text-gray-600">
            Dry-run: no DM is sent. We just show whether the keyword match fires and what the
            rendered reply would look like.
          </p>

          <label htmlFor="test-fire-sample-text" className="block text-sm font-medium">
            Sample comment / DM text
          </label>
          <textarea
            id="test-fire-sample-text"
            ref={inputRef}
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            rows={3}
            placeholder="e.g. send me the LINK"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            data-testid="test-fire-sample-text"
          />

          <label htmlFor="test-fire-sample-username" className="mt-3 block text-sm font-medium">
            Sample username (optional, used in template variables)
          </label>
          <input
            id="test-fire-sample-username"
            type="text"
            value={sampleUsername}
            onChange={(e) => setSampleUsername(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            data-testid="test-fire-sample-username"
          />

          {error !== null && (
            <p
              className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
              data-testid="test-fire-error"
            >
              {error}
            </p>
          )}

          {result !== null && (
            <div className="mt-4 space-y-3" data-testid="test-fire-result">
              <div
                className={`rounded border p-3 text-sm ${
                  result.matched
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
                data-testid={result.matched ? 'test-fire-matched' : 'test-fire-unmatched'}
              >
                <strong>{result.matched ? '✓ Would fire' : '✗ Would NOT fire'}</strong>
                <br />
                <span className="text-xs">{result.matchReason}</span>
              </div>

              {result.matched && result.renderedContent !== null && (
                <div className="rounded border bg-gray-50 p-3" data-testid="test-fire-rendered-dm">
                  <p className="mb-1 text-xs uppercase tracking-wide text-gray-600">
                    DM that would be sent{' '}
                    {result.mode === 'ai' && '(fallback shown — AI generates at runtime)'}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{result.renderedContent}</p>
                </div>
              )}

              {result.matched && result.renderedCommentReply !== null && (
                <div
                  className="rounded border bg-gray-50 p-3"
                  data-testid="test-fire-rendered-comment-reply"
                >
                  <p className="mb-1 text-xs uppercase tracking-wide text-gray-600">
                    Public comment reply (only fires for comment-trigger automations)
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{result.renderedCommentReply}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleFire}
            disabled={submitting || sampleText.trim() === ''}
            className="rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            data-testid="test-fire-submit"
          >
            {submitting ? 'Running…' : 'Test fire'}
          </button>
        </footer>
      </div>
    </div>
  );
}
