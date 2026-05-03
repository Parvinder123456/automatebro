import { listLeads } from '@automatebro/shared/handlers/leads/listLeads';
import { redirect } from 'next/navigation';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Leads — AutomateBro' };

export default async function LeadsPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const leads = await listLeads(ctx);

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

      {leads.length === 0 ? (
        <p className="text-gray-500">No leads captured yet.</p>
      ) : (
        <table className="w-full text-left text-sm" data-testid="leads-table">
          <thead>
            <tr className="border-b text-gray-600">
              <th className="pb-2">Username</th>
              <th className="pb-2">Email</th>
              <th className="pb-2">Phone</th>
              <th className="pb-2">First seen</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead._id} className="border-b">
                <td className="py-2">{lead.igUsername ?? '—'}</td>
                <td className="py-2">{lead.email ?? '—'}</td>
                <td className="py-2">{lead.phone ?? '—'}</td>
                <td className="py-2">
                  {lead.firstSeenAt ? new Date(lead.firstSeenAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
