import { listLeads } from '@automatebro/shared/handlers/leads/listLeads';
import { redirect } from 'next/navigation';
import { Pager } from '../../../../components/app/pager';
import { TagEditor } from '../../../../components/leads/tag-editor';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Leads — BloomDM' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}

function intParam(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return fallback;
  return Math.max(1, Math.min(max, Number(raw)));
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const sp = await searchParams;
  const page = intParam(sp.page, 1, 10_000);
  const pageSize = intParam(sp.pageSize, 25, 100);

  const result = await listLeads(ctx, { page, pageSize });
  const items = result.items;

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <a
          href="/api/v1/leads?format=csv"
          className="rounded border px-4 py-2 text-sm"
          data-testid="leads-csv-link"
        >
          Export CSV
        </a>
      </div>

      {result.total === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center"
          data-testid="leads-empty"
        >
          <p className="mb-2 text-base font-medium">No leads captured yet</p>
          <p className="mx-auto mb-4 max-w-md text-sm text-gray-600">
            Leads are captured when an Instagram user replies to your auto-DM with their email or
            phone number. Configure an automation that asks for contact info, then watch this page
            fill up.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="/app/automations/new"
              className="rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Create lead-capture automation →
            </a>
            <a
              href="/app/automations"
              className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
            >
              See existing automations
            </a>
          </div>
        </div>
      ) : (
        <>
          <table className="w-full text-left text-sm" data-testid="leads-table">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="pb-2">Username</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Phone</th>
                <th className="pb-2">Tags</th>
                <th className="pb-2">First seen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <tr key={lead._id} className="border-b">
                  <td className="py-2">{lead.igUsername ?? '—'}</td>
                  <td className="py-2">{lead.email ?? '—'}</td>
                  <td className="py-2">{lead.phone ?? '—'}</td>
                  <td className="py-2">
                    <TagEditor leadId={lead._id} initialTags={lead.tags} />
                  </td>
                  <td className="py-2">
                    {lead.firstSeenAt ? new Date(lead.firstSeenAt).toLocaleDateString() : '—'}
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
            basePath="/app/leads"
          />
        </>
      )}
    </div>
  );
}
