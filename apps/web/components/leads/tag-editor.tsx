'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

interface TagEditorProps {
  leadId: string;
  initialTags: string[];
}

/**
 * Spec 024 / Phase 4.4 — inline tag chip editor for a lead row.
 *
 * Renders existing tags as chips with × to remove. A small input lets
 * the tenant type a new tag and press Enter / comma to add. Submits
 * via PATCH /api/v1/leads/[id]/tags using the optimistic-then-confirm
 * pattern: state updates immediately, request fires in the background,
 * router.refresh() on success to re-sync from server.
 */
export function TagEditor({ leadId, initialTags }: TagEditorProps) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  function normalise(raw: string): string | null {
    const t = raw.trim().toLowerCase();
    if (t === '') return null;
    return t.slice(0, 64);
  }

  async function patch(body: {
    add?: string[];
    remove?: string[];
  }): Promise<{ tags: string[] } | null> {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        window.alert(`Could not update tags: ${errBody.message ?? `HTTP ${res.status}`}`);
        return null;
      }
      const data = (await res.json()) as { leadId: string; tags: string[] };
      return { tags: data.tags };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleAdd(): Promise<void> {
    const t = normalise(draft);
    if (t === null) return;
    if (tags.includes(t)) {
      setDraft('');
      return;
    }
    // Optimistic update.
    const previous = tags;
    const optimistic = [...tags, t];
    setTags(optimistic);
    setDraft('');
    const result = await patch({ add: [t] });
    if (result !== null) {
      // Server is authoritative — re-sync.
      setTags(result.tags);
      router.refresh();
    } else {
      setTags(previous);
    }
  }

  async function handleRemove(tag: string): Promise<void> {
    const previous = tags;
    setTags(tags.filter((t) => t !== tag));
    const result = await patch({ remove: [tag] });
    if (result !== null) {
      setTags(result.tags);
      router.refresh();
    } else {
      setTags(previous);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      void handleAdd();
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      // Pressing Backspace on empty input removes the last tag —
      // standard chip-editor pattern.
      const last = tags[tags.length - 1];
      if (last !== undefined) void handleRemove(last);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={`tag-editor-${leadId}`}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-gray-200 px-2 py-0.5 text-xs"
          data-testid={`tag-chip-${tag}`}
        >
          {tag}
          <button
            type="button"
            onClick={() => handleRemove(tag)}
            className="text-gray-500 hover:text-red-600"
            aria-label={`Remove tag ${tag}`}
            disabled={busy}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim() !== '') void handleAdd();
        }}
        placeholder="+ tag"
        className="w-20 rounded border border-transparent px-1 py-0.5 text-xs focus:border-gray-300 focus:outline-none"
        disabled={busy}
        data-testid={`tag-input-${leadId}`}
      />
    </div>
  );
}
