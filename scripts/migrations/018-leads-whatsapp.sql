-- Spec 026 — leads cross-channel identity.
--
-- Changes:
--   1. Relax igAccountId + igUserId to nullable (a lead can be WA-only).
--   2. Add WA fields: whatsappPhone, whatsappAccountId, whatsappOptInAt,
--      whatsappOptOutAt, lastWhatsappInboundAt, lastTemplateConversationAt.
--   3. Drop the old strict UNIQUE (tenantId, igAccountId, igUserId).
--      Replace with a partial UNIQUE that only applies when igUserId
--      IS NOT NULL — preserving the IG dedup invariant for IG leads
--      while allowing WA-only leads with NULL igUserId.
--   4. Add partial UNIQUE on (tenantId, whatsappPhone) WHERE
--      whatsappPhone IS NOT NULL for WA dedup.
--   5. CHECK that at least one identity (igUserId or whatsappPhone) is
--      set — a lead with neither makes no sense.
--
-- Existing IG-only leads: igUserId set, whatsappPhone NULL — they
-- continue to be uniquely identified by the partial unique index. No
-- data change.

BEGIN;

-- 1. Relax NOT NULL.
ALTER TABLE public."leads"
  ALTER COLUMN "igAccountId" DROP NOT NULL,
  ALTER COLUMN "igUserId" DROP NOT NULL;

-- 2. Add WA columns.
ALTER TABLE public."leads"
  ADD COLUMN IF NOT EXISTS "whatsappPhone"                TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappAccountId"            UUID,
  ADD COLUMN IF NOT EXISTS "whatsappOptInAt"              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "whatsappOptOutAt"             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastWhatsappInboundAt"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastTemplateConversationAt"   TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_whatsappAccountId_fkey'
  ) THEN
    ALTER TABLE public."leads"
      ADD CONSTRAINT "leads_whatsappAccountId_fkey"
      FOREIGN KEY ("whatsappAccountId")
      REFERENCES public."whatsappAccounts"("_id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Drop old unique. Postgres auto-named it leads_tenantId_igAccountId_igUserId_key
--    when the original migration declared UNIQUE(...) inline.
ALTER TABLE public."leads"
  DROP CONSTRAINT IF EXISTS "leads_tenantId_igAccountId_igUserId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_leads_ig_identity"
  ON public."leads"("tenantId", "igAccountId", "igUserId")
  WHERE "igUserId" IS NOT NULL;

-- 4. WA partial unique.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_leads_whatsapp_identity"
  ON public."leads"("tenantId", "whatsappPhone")
  WHERE "whatsappPhone" IS NOT NULL;

-- 5. At-least-one-identity CHECK.
ALTER TABLE public."leads"
  DROP CONSTRAINT IF EXISTS "leads_identity_present";

ALTER TABLE public."leads"
  ADD CONSTRAINT "leads_identity_present"
  CHECK ("igUserId" IS NOT NULL OR "whatsappPhone" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_leads_tenantId_whatsappPhone"
  ON public."leads"("tenantId", "whatsappPhone")
  WHERE "whatsappPhone" IS NOT NULL;

COMMIT;
