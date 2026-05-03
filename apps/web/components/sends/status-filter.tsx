const STATUSES = ['sent', 'failed', 'queued', 'rateLimited', 'outsideWindow'] as const;

export function StatusFilter({ current }: { current?: string | undefined }) {
  return (
    <nav className="mb-4 flex gap-2 text-sm" data-testid="sends-status-filter">
      <a
        href="/app/sends"
        className={`rounded px-3 py-1 ${current === undefined ? 'bg-black text-white' : 'border'}`}
      >
        All
      </a>
      {STATUSES.map((s) => (
        <a
          key={s}
          href={`/app/sends?status=${s}`}
          className={`rounded px-3 py-1 ${current === s ? 'bg-black text-white' : 'border'}`}
        >
          {s === 'rateLimited' ? 'Rate Limited' : s === 'outsideWindow' ? 'Outside Window' : s.charAt(0).toUpperCase() + s.slice(1)}
        </a>
      ))}
    </nav>
  );
}
