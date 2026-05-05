/**
 * Spec 020 / Phase 2.3 — pagination control for list pages.
 *
 * Server Component — renders Prev / Next links that point at the same
 * page with `?page=N` updated. The host page reads `searchParams.page`
 * to fetch the right slice. URL-driven so back-button / refresh / share
 * works.
 */

interface PagerProps {
  /** Current 1-indexed page. */
  page: number;
  pageSize: number;
  total: number;
  /** True if there's a next page. */
  hasNext: boolean;
  /**
   * Base path (e.g. "/app/leads"). Existing query params are preserved
   * via `extraParams`.
   */
  basePath: string;
  /**
   * Extra query params to preserve across page navigation (e.g.
   * `{ status: 'failed' }` on /app/sends). Page itself is set by Pager.
   */
  extraParams?: Record<string, string>;
}

function buildHref(basePath: string, page: number, extra: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) {
    if (v !== '' && v !== undefined) params.set(k, v);
  }
  params.set('page', String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pager({ page, pageSize, total, hasNext, basePath, extraParams }: PagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const extra = extraParams ?? {};

  return (
    <nav
      className="mt-4 flex items-center justify-between border-t pt-4 text-sm text-gray-700"
      aria-label="Pagination"
      data-testid="pager"
    >
      <p>
        {total === 0 ? (
          <span data-testid="pager-empty">No rows</span>
        ) : (
          <>
            Showing <strong>{start}</strong>–<strong>{end}</strong> of <strong>{total}</strong>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <a
            href={buildHref(basePath, page - 1, extra)}
            className="rounded border px-3 py-1 hover:bg-gray-50"
            data-testid="pager-prev"
          >
            ← Prev
          </a>
        ) : (
          <span
            className="rounded border px-3 py-1 text-gray-400"
            aria-disabled="true"
            data-testid="pager-prev-disabled"
          >
            ← Prev
          </span>
        )}
        <span className="text-xs text-gray-500" data-testid="pager-page">
          Page {page} of {totalPages}
        </span>
        {hasNext ? (
          <a
            href={buildHref(basePath, page + 1, extra)}
            className="rounded border px-3 py-1 hover:bg-gray-50"
            data-testid="pager-next"
          >
            Next →
          </a>
        ) : (
          <span
            className="rounded border px-3 py-1 text-gray-400"
            aria-disabled="true"
            data-testid="pager-next-disabled"
          >
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
