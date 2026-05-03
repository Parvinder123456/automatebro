-- Spec 008 — aiUsage cost tracking + per-tenant per-month cap.

CREATE TABLE IF NOT EXISTS public."aiUsage" (
  "_id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "month"         TEXT NOT NULL,
  "inputTokens"   BIGINT NOT NULL DEFAULT 0,
  "outputTokens"  BIGINT NOT NULL DEFAULT 0,
  "costInr"       BIGINT NOT NULL DEFAULT 0,
  "cap"           BIGINT NOT NULL,
  UNIQUE ("tenantId", "month")
);

CREATE INDEX IF NOT EXISTS "idx_aiUsage_tenantId" ON public."aiUsage"("tenantId");
