-- Spec 026 — whatsappTemplates table.
--
-- Tenant-authored message templates, submitted to Meta for approval.
-- v1: text-only body + optional footer. Buttons + media headers + lists
-- land in spec 027; the schema here doesn't store those yet.
--
-- The Meta name regex (lowercase a-z, 0-9, underscore) is enforced at
-- the Zod boundary and re-asserted with a CHECK here for defence in
-- depth.
--
-- Status lifecycle: draft → pending → approved | rejected | paused.
-- 'disabled' is a tenant-side override that wins over Meta's status
-- (still won't send even if Meta has it approved).
--
-- (tenantId, name, language) is unique because Meta itself uses
-- (waba_id, name, language) as the natural key — different tenants own
-- different WABAs, so adding tenantId scopes correctly.

CREATE TABLE IF NOT EXISTS public."whatsappTemplates" (
  "_id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "whatsappAccountId"    UUID NOT NULL REFERENCES public."whatsappAccounts"("_id") ON DELETE CASCADE,
  "name"                 TEXT NOT NULL CHECK ("name" ~ '^[a-z0-9_]+$' AND length("name") <= 512),
  "category"             TEXT NOT NULL
    CHECK ("category" IN ('service','utility','marketing','authentication')),
  "language"             TEXT NOT NULL CHECK (length("language") BETWEEN 2 AND 10),
  "bodyText"             TEXT NOT NULL CHECK (length("bodyText") BETWEEN 1 AND 1024),
  "footerText"           TEXT CHECK ("footerText" IS NULL OR length("footerText") <= 60),
  "variableCount"        INT NOT NULL DEFAULT 0 CHECK ("variableCount" >= 0),
  "status"               TEXT NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','pending','approved','rejected','paused','disabled')),
  "metaTemplateId"       TEXT,
  "rejectionReason"      TEXT,
  "submittedAt"          TIMESTAMPTZ,
  "approvedAt"           TIMESTAMPTZ,
  "rejectedAt"           TIMESTAMPTZ,
  "pausedAt"             TIMESTAMPTZ,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "name", "language")
);

CREATE INDEX IF NOT EXISTS "idx_whatsappTemplates_tenantId_status"
  ON public."whatsappTemplates"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "idx_whatsappTemplates_metaTemplateId"
  ON public."whatsappTemplates"("metaTemplateId")
  WHERE "metaTemplateId" IS NOT NULL;
