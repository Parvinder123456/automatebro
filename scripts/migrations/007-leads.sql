-- Spec 009 — leads table.
--
-- Captured contacts from inbound DMs. Unique on (tenantId, igAccountId,
-- igUserId) so the same end user replying twice on the same account
-- updates the existing row instead of creating a duplicate.

CREATE TABLE IF NOT EXISTS public."leads" (
  "_id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "igAccountId"             UUID NOT NULL REFERENCES public."igAccounts"("_id") ON DELETE CASCADE,
  "igUserId"                TEXT NOT NULL,
  "igUsername"              TEXT,
  "email"                   TEXT,
  "phone"                   TEXT,
  "firstSeenAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSeenAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
  "tags"                    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attributedAutomationId"  UUID REFERENCES public."automations"("_id") ON DELETE SET NULL,
  UNIQUE ("tenantId", "igAccountId", "igUserId")
);

CREATE INDEX IF NOT EXISTS "idx_leads_tenantId_email" ON public."leads"("tenantId","email");
CREATE INDEX IF NOT EXISTS "idx_leads_tenantId_lastSeen"
  ON public."leads"("tenantId","lastSeenAt" DESC);
