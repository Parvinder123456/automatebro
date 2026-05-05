'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { TestFireModal } from './test-fire-modal';

export function RowActions({
  automationId,
  status,
}: {
  automationId: string;
  status: string;
}) {
  const router = useRouter();
  const busyRef = useRef(false);
  // Spec 022 / Phase 4.5 — test-fire modal state per row.
  const [testFireOpen, setTestFireOpen] = useState(false);

  async function toggleStatus() {
    if (busyRef.current) return;
    busyRef.current = true;
    const newStatus = status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`/api/v1/automations/${encodeURIComponent(automationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } finally {
      busyRef.current = false;
    }
  }

  async function handleDelete() {
    if (busyRef.current) return;
    if (!window.confirm('Delete this automation?')) return;
    busyRef.current = true;
    try {
      await fetch(`/api/v1/automations/${encodeURIComponent(automationId)}`, {
        method: 'DELETE',
      });
      router.refresh();
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => setTestFireOpen(true)}
          className="text-xs underline"
          data-testid={`test-fire-button-${automationId}`}
        >
          Test fire
        </button>
        <button type="button" onClick={toggleStatus} className="text-xs underline">
          {status === 'active' ? 'Pause' : 'Resume'}
        </button>
        <button type="button" onClick={handleDelete} className="text-xs text-red-600 underline">
          Delete
        </button>
      </span>
      <TestFireModal
        automationId={automationId}
        open={testFireOpen}
        onClose={() => setTestFireOpen(false)}
      />
    </>
  );
}
