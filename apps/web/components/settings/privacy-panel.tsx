'use client';

import { useState } from 'react';
import { DeleteConfirmModal } from './delete-confirm-modal';

interface PrivacyPanelProps {
  workspaceName: string;
}

/**
 * Spec 013 §4.5 — privacy actions panel on /app/settings.
 *
 * Two actions:
 *   - "Download my data" — anchor to the export route. The browser's
 *     native download mechanism handles `Content-Disposition: attachment`
 *     for us; we don't fetch + Blob because that strips the disposition
 *     headers and reuses memory.
 *   - "Delete workspace" — opens the typed-confirmation modal.
 */
export function PrivacyPanel({ workspaceName }: PrivacyPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="rounded border border-red-200 bg-red-50/40 p-5" data-testid="privacy-panel">
      <h2 className="text-lg font-semibold">Privacy &amp; data rights</h2>
      <p className="mt-1 text-sm text-gray-600">
        Under DPDP §11–§12 you can export or delete your workspace at any time.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <h3 className="font-medium">Download my data</h3>
          <p className="mt-1 text-sm text-gray-600">
            JSON export of every row attached to this workspace. Encrypted tokens are redacted.
          </p>
          <a
            href="/api/v1/privacy/export"
            download
            className="mt-3 inline-block rounded border px-4 py-2 text-sm hover:bg-gray-50"
            data-testid="privacy-export-link"
          >
            Download JSON
          </a>
        </div>

        <div className="rounded border bg-white p-4">
          <h3 className="font-medium text-red-700">Delete workspace</h3>
          <p className="mt-1 text-sm text-gray-600">
            Soft-deletes immediately. 30-day undo via email. Hard-deleted after that.
          </p>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-3 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            data-testid="privacy-delete-trigger"
          >
            Delete workspace…
          </button>
        </div>
      </div>

      <DeleteConfirmModal
        workspaceName={workspaceName}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  );
}
