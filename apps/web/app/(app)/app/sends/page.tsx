import { listSends } from '@automatebro/shared/handlers/sends/listSends';
import { redirect } from 'next/navigation';
import { Pager } from '../../../../components/app/pager';
import { StatusFilter } from '../../../../components/sends/status-filter';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Sends — AutomateBro' };
export const dynamic = 'force-dynamic';

const STATUSES = ['queued', 'sent', 'failed', 'rateLimited', 'outsideWindow'] as const;

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string; pageSize?: string }>;
}

function intParam(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return fallback;
  return Math.max(1, Math.min(max, Number(raw)));
}

export default async function SendsPage({ searchParams }: PageProps) {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const params = await searchParams;
  const statusFilter = STATUSES.includes(params.status as (typeof STATUSES)[number])
    ? (params.status as (typeof STATUSES)[number])
    : undefined;
  const page = intParam(params.page, 1, 10_000);
  const pageSize = intParam(params.pageSize, 25, 100);

  const result = await listSends(ctx, {
    page,
    pageSize,
    ...(statusFilter ? { status: statusFilter } : {}),
  });
  const items = result.items;

  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Sends</h1>

      <StatusFilter current={statusFilter} />

      {result.total === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center"
          data-testid="sends-empty"
        >
          <p className="mb-2 text-base font-medium">
            {statusFilter !== undefined ? `No ${statusFilter} sends` : 'No sends yet'}
          </p>
          <p className="mx-auto mb-4 max-w-md text-sm text-gray-600">
            {statusFilter !== undefined
              ? 'Try a different status filter or remove the filter to see all sends.'
              : 'Sends appear here when an active automation fires. Each row shows the rendered DM, status (queued/sent/failed/rate-limited), and the queue time.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {statusFilter !== undefined ? (
              <a href="/app/sends" className="rounded border px-4 py-2 text-sm hover:bg-gray-50">
                Clear filter
              </a>
            ) : (
              <a
                href="/app/automations"
                className="rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90"
              >
                Open automations →
              </a>
            )}
          </div>
        </div>
      ) : (
        <>
          <table className="w-full text-left text-sm" data-testid="sends-table">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="pb-2">Content</th>
                <th className="pb-2">Kind</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Queued at</th>
              </tr>
            </thead>
            <tbody>
              {items.map((send) => (
                <tr key={send._id} className="border-b">
                  <td className="py-2">{send.content}</td>
                  <td className="py-2">{send.kind}</td>
                  <td className="py-2">{send.status}</td>
                  <td className="py-2">
                    {send.queuedAt ? new Date(send.queuedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            hasNext={result.hasNext}
            basePath="/app/sends"
            extraParams={statusFilter ? { status: statusFilter } : {}}
          />
        </>
      )}
    </div>
  );
}
