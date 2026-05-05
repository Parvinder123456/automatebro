/**
 * Spec 013 §3.2 — DPDP §11 / GDPR Article 15 access right.
 *
 * Returns a JSON-serialisable snapshot of every tenant-scoped row the
 * caller's tenant owns. Token ciphertexts are redacted — see §3.2 of
 * the spec for rationale.
 *
 * Hard-cap each collection at 10,000 rows; anything bigger is operator
 * support territory.
 */
import type { Ctx } from '../../auth/ctx.js';
import { getDb } from '../../db/client.js';
import { repo } from '../../db/repo.js';
import type {
  AiUsage,
  Automation,
  EventRecord,
  IgAccount,
  Lead,
  ResponseRecord,
  Send,
  Tenant,
  Trigger,
} from '../../types/tenant.js';

const ROW_LIMIT = 10_000;

export interface RedactedIgAccount
  extends Omit<IgAccount, 'accessTokenCiphertext' | 'accessTokenIv' | 'accessTokenTag'> {
  accessTokenCiphertext: null;
  accessTokenIv: null;
  accessTokenTag: null;
  redacted: true;
}

export interface TenantExport {
  exportedAt: Date;
  schemaVersion: 1;
  tenant: Tenant | null;
  igAccounts: RedactedIgAccount[];
  automations: Automation[];
  triggers: Trigger[];
  responses: ResponseRecord[];
  sends: Send[];
  events: EventRecord[];
  leads: Lead[];
  aiUsage: AiUsage[];
  truncated: Record<string, boolean>;
}

export async function exportTenantData(ctx: Ctx): Promise<TenantExport> {
  if (ctx.tenantId === null) {
    throw new Error('exportTenantData: ctx has no tenant');
  }

  const db = await getDb();

  // tenants is queried directly because it has no `tenantId` column
  // (it IS the tenant). Filter by `_id`.
  const tenant = await db.queryOne<Tenant>('tenants', { _id: ctx.tenantId } as never);

  // All other collections are tenant-scoped — go through repo so the
  // tenantId filter is auto-merged. Hard-cap each at ROW_LIMIT.
  const [igAccounts, automations, triggers, responses, sends, events, leads, aiUsage] =
    await Promise.all([
      repo.queryMany<IgAccount>('igAccounts', {}, ctx, { limit: ROW_LIMIT }),
      repo.queryMany<Automation>('automations', {}, ctx, { limit: ROW_LIMIT }),
      repo.queryMany<Trigger>('triggers', {}, ctx, { limit: ROW_LIMIT }),
      repo.queryMany<ResponseRecord>('responses', {}, ctx, { limit: ROW_LIMIT }),
      repo.queryMany<Send>('sends', {}, ctx, { limit: ROW_LIMIT }),
      repo.queryMany<EventRecord>('events', {}, ctx, { limit: ROW_LIMIT }),
      repo.queryMany<Lead>('leads', {}, ctx, { limit: ROW_LIMIT }),
      repo.queryMany<AiUsage>('aiUsage', {}, ctx, { limit: ROW_LIMIT }),
    ]);

  // Redact token bytes — see spec 013 §3.2. They're not the tenant's
  // PII, they're access credentials, and shipping them in a downloaded
  // file is a security regression.
  const redactedIgAccounts: RedactedIgAccount[] = igAccounts.map((acc) => {
    const { accessTokenCiphertext: _c, accessTokenIv: _i, accessTokenTag: _t, ...rest } = acc;
    return {
      ...rest,
      accessTokenCiphertext: null,
      accessTokenIv: null,
      accessTokenTag: null,
      redacted: true,
    };
  });

  const truncated: Record<string, boolean> = {
    igAccounts: igAccounts.length === ROW_LIMIT,
    automations: automations.length === ROW_LIMIT,
    triggers: triggers.length === ROW_LIMIT,
    responses: responses.length === ROW_LIMIT,
    sends: sends.length === ROW_LIMIT,
    events: events.length === ROW_LIMIT,
    leads: leads.length === ROW_LIMIT,
    aiUsage: aiUsage.length === ROW_LIMIT,
  };

  return {
    exportedAt: new Date(),
    schemaVersion: 1,
    tenant,
    igAccounts: redactedIgAccounts,
    automations,
    triggers,
    responses,
    sends,
    events,
    leads,
    aiUsage,
    truncated,
  };
}
