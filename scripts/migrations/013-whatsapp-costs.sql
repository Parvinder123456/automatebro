-- Spec 026 — whatsappCosts table.
--
-- Per-tenant per-month conversation aggregator. Mirror of `aiUsage` —
-- lazy-create on first send, return synthetic zero-row on read if
-- absent (per spec 019 lessons).
--
-- conversationsByCategory is JSONB so adding a new category in future
-- (Meta has expanded the list before) doesn't require a migration. We
-- still constrain the v1 shape via Zod at the boundary.
--
-- Unique on (tenantId, whatsappAccountId, month) — a tenant with two
-- connected numbers gets two rows per month.

CREATE TABLE IF NOT EXISTS public."whatsappCosts" (
  "_id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "whatsappAccountId"         UUID NOT NULL REFERENCES public."whatsappAccounts"("_id") ON DELETE CASCADE,
  "month"                     TEXT NOT NULL CHECK ("month" ~ '^\d{4}-\d{2}$'),
  "conversationsByCategory"   JSONB NOT NULL DEFAULT
    '{"service":0,"utility":0,"marketing":0,"authentication":0}'::jsonb,
  UNIQUE ("tenantId", "whatsappAccountId", "month")
);

CREATE INDEX IF NOT EXISTS "idx_whatsappCosts_tenantId_month"
  ON public."whatsappCosts"("tenantId", "month");
