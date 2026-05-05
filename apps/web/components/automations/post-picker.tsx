'use client';

import { useEffect, useRef, useState } from 'react';

interface MediaItem {
  id: string;
  mediaType: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  caption: string | null;
  timestamp: string | null;
}

interface PostPickerProps {
  igAccountId: string;
  /** Currently-selected post IDs. Empty array = "all posts" (default). */
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Disable when no IG account is chosen yet or trigger isn't post-bound. */
  disabled?: boolean;
}

/**
 * Phase 1.3 / spec 017 — Instagram post / reel picker.
 *
 * Modal with a thumbnail grid backed by `GET /api/v1/igAccounts/[id]/media`.
 * Empty selection means "fire on all posts" (matches the existing
 * `triggers.postIds = null` semantics in the schema).
 *
 * Pagination: load-more button uses Meta's cursor. No infinite scroll
 * for v1 — keeps the UX deterministic and the network usage bounded.
 *
 * Cache: handler is cache-injection-ready (see listIgMedia). UI doesn't
 * cache anywhere; second open of the same account refetches. That's the
 * accepted v1 trade-off; Phase 2 wires Redis.
 */
export function PostPicker({ igAccountId, selected, onChange, disabled }: PostPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // Fetch first page when modal opens (and we have an account).
  useEffect(() => {
    if (!open || igAccountId === '' || loadingRef.current) return;
    void loadPage(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, igAccountId]);

  async function loadPage(cursor: string | null, replace: boolean): Promise<void> {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `/api/v1/igAccounts/${encodeURIComponent(igAccountId)}/media`,
        window.location.origin,
      );
      if (cursor !== null && cursor !== '') url.searchParams.set('cursor', cursor);
      url.searchParams.set('limit', '50');
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Server returned ${res.status}`);
      }
      const data = (await res.json()) as { media: MediaItem[]; next: string | null };
      setItems((prev) => (replace ? data.media : [...prev, ...data.media]));
      setNext(data.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function toggle(id: string): void {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  function clearAll(): void {
    onChange([]);
  }

  const labelText =
    selected.length === 0
      ? 'All posts (default)'
      : `${selected.length} post${selected.length === 1 ? '' : 's'} selected`;

  return (
    <div data-testid="post-picker">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled === true || igAccountId === ''}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          data-testid="post-picker-open"
        >
          Pick posts…
        </button>
        <span className="text-sm text-gray-700" data-testid="post-picker-label">
          {labelText}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-gray-500 underline hover:text-gray-700"
            data-testid="post-picker-clear"
          >
            Clear (fire on all posts)
          </button>
        )}
      </div>

      {open && (
        // Modal — same role=dialog div pattern as delete-confirm-modal.
        // biome-ignore lint/a11y/useSemanticElements: Tailwind-styled modal pattern (see CLAUDE.md spec 013 lessons)
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="post-picker-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-testid="post-picker-modal"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
            <header className="flex items-center justify-between border-b px-5 py-3">
              <h2 id="post-picker-title" className="text-lg font-semibold">
                Pick posts
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-gray-500 hover:text-gray-800"
                data-testid="post-picker-close"
              >
                Done
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {error !== null && (
                <p
                  className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
                  data-testid="post-picker-error"
                >
                  {error}
                </p>
              )}
              {items.length === 0 && !loading && error === null && (
                <p className="py-8 text-center text-sm text-gray-600">
                  No posts found. This Instagram account may have no grid media yet.
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {items.map((item) => {
                  const isSelected = selected.includes(item.id);
                  const thumb = item.thumbnailUrl ?? item.mediaUrl;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`group relative aspect-square overflow-hidden rounded border-2 ${
                        isSelected ? 'border-black ring-2 ring-black' : 'border-transparent'
                      }`}
                      data-testid={`post-item-${item.id}`}
                      data-selected={isSelected ? 'true' : 'false'}
                    >
                      {thumb !== null ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={item.caption?.slice(0, 60) ?? `Post ${item.id}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-500">
                          {item.mediaType}
                        </div>
                      )}
                      {isSelected && (
                        <span className="absolute right-1 top-1 rounded-full bg-black px-2 py-0.5 text-xs text-white">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {next !== null && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => loadPage(next, false)}
                    disabled={loading}
                    className="rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    data-testid="post-picker-load-more"
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
              {loading && items.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-600">Loading posts…</p>
              )}
            </div>

            <footer className="flex items-center justify-between border-t px-5 py-3 text-sm text-gray-700">
              <span>
                {selected.length === 0
                  ? 'No selection — automation fires on all posts.'
                  : `${selected.length} selected`}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90"
                data-testid="post-picker-confirm"
              >
                Done
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
