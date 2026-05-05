'use client';

import { useEffect, useRef, useState } from 'react';

interface DeleteConfirmModalProps {
  workspaceName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Spec 013 §4.5 — typed-confirmation modal for the delete-workspace
 * action. Reuses the form patterns we leaned on for spec 011: a
 * synchronous useRef guard against double-submit, a hydration-aware
 * disabled state, and an exact-string match on "DELETE" before the
 * destructive button activates.
 */
export function DeleteConfirmModal({ workspaceName, open, onClose }: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the input when the modal opens. Reset state on close.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setConfirmText('');
      setError(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submittingRef.current) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleDelete(): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch('/api/v1/privacy/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
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

    // Hard-nav so the next request sees the deleted-tenant state and
    // the (app) layout redirects to /deleted.
    window.location.href = '/deleted';
  }

  const canDelete = confirmText === 'DELETE' && !submitting;

  return (
    // We use a div with role=dialog rather than the native <dialog>
    // element because <dialog> requires showModal() to render, which
    // means an extra useEffect + ref + DOM mutation on every open. The
    // ARIA-equivalent div pattern is well-supported and matches our
    // existing modal-free Tailwind styling. Biome's a11y rule prefers
    // semantic <dialog> — we suppress here with reasoning.
    // biome-ignore lint/a11y/useSemanticElements: see comment above
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="delete-confirm-modal"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="delete-modal-title" className="text-xl font-semibold text-red-700">
          Delete &quot;{workspaceName}&quot;?
        </h2>
        <p className="mt-3 text-sm text-gray-700">
          This soft-deletes your workspace immediately. Connected Instagram accounts will be
          disconnected. Your data will be permanently erased <strong>30 days</strong> from now.
          Email us before then to recover.
        </p>
        <p className="mt-3 text-sm text-gray-700">
          Type <code className="rounded bg-gray-100 px-1.5 py-0.5">DELETE</code> to confirm:
        </p>
        <input
          ref={inputRef}
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-2 block w-full rounded border px-3 py-2"
          autoComplete="off"
          spellCheck={false}
          data-testid="delete-confirm-input"
        />
        {error !== null && (
          <p className="mt-2 text-sm text-red-600" data-testid="delete-confirm-error">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="delete-confirm-submit"
          >
            {submitting ? 'Deleting…' : 'Delete workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
