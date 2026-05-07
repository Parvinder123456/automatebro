-- Spec 026 — extend sends for WhatsApp.
--
-- Changes:
--   1. Add `channel` column with default 'instagram' and backfill all
--      existing rows. New IG sends still set it explicitly; the default
--      is just for the migration's safety.
--   2. Extend kind CHECK to include 'whatsappFreeform', 'whatsappTemplate'.
--   3. Extend status CHECK to include 'optedOut', 'dailyCapExceeded'.
--   4. Add whatsappAccountId nullable column + FK.
--   5. Add recipientPhone nullable column.
--   6. Add WA-template-specific columns (templateId, name, language, params).
--   7. Relax igAccountId + recipientPsid to nullable.
--   8. Add CHECK constraints enforcing per-channel column population.

BEGIN;

-- 1. channel column.
ALTER TABLE public."sends"
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'instagram'
    CHECK ("channel" IN ('instagram','whatsapp'));

-- (Default already backfills existing rows to 'instagram'; no UPDATE
-- needed because the column was created with the default.)

-- 2. Extend kind CHECK.
ALTER TABLE public."sends"
  DROP CONSTRAINT IF EXISTS "sends_kind_check";

ALTER TABLE public."sends"
  ADD CONSTRAINT "sends_kind_check"
  CHECK ("kind" IN ('dm','commentReply','whatsappFreeform','whatsappTemplate'));

-- 3. Extend status CHECK.
ALTER TABLE public."sends"
  DROP CONSTRAINT IF EXISTS "sends_status_check";

ALTER TABLE public."sends"
  ADD CONSTRAINT "sends_status_check"
  CHECK ("status" IN (
    'queued','sent','failed','rateLimited','outsideWindow','optedOut','dailyCapExceeded'
  ));

-- 4. whatsappAccountId column + FK.
ALTER TABLE public."sends"
  ADD COLUMN IF NOT EXISTS "whatsappAccountId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sends_whatsappAccountId_fkey'
  ) THEN
    ALTER TABLE public."sends"
      ADD CONSTRAINT "sends_whatsappAccountId_fkey"
      FOREIGN KEY ("whatsappAccountId")
      REFERENCES public."whatsappAccounts"("_id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 5. recipientPhone column.
ALTER TABLE public."sends"
  ADD COLUMN IF NOT EXISTS "recipientPhone" TEXT;

-- 6. Template-specific columns. whatsappTemplateId references the
--    tenant's local template row, not Meta's ID — that's
--    whatsappTemplateName + whatsappTemplateLanguage which Meta uses
--    to identify the approved template at send time.
ALTER TABLE public."sends"
  ADD COLUMN IF NOT EXISTS "whatsappTemplateId" UUID,
  ADD COLUMN IF NOT EXISTS "whatsappTemplateName" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappTemplateLanguage" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsappTemplateParams" TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sends_whatsappTemplateId_fkey'
  ) THEN
    ALTER TABLE public."sends"
      ADD CONSTRAINT "sends_whatsappTemplateId_fkey"
      FOREIGN KEY ("whatsappTemplateId")
      REFERENCES public."whatsappTemplates"("_id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 7. Relax igAccountId + recipientPsid NOT NULL.
ALTER TABLE public."sends"
  ALTER COLUMN "igAccountId" DROP NOT NULL,
  ALTER COLUMN "recipientPsid" DROP NOT NULL;

-- 8. Per-channel CHECK constraints.
ALTER TABLE public."sends"
  DROP CONSTRAINT IF EXISTS "sends_channel_account_consistency",
  DROP CONSTRAINT IF EXISTS "sends_channel_recipient_consistency";

ALTER TABLE public."sends"
  ADD CONSTRAINT "sends_channel_account_consistency"
  CHECK (
    ("channel" = 'instagram' AND "igAccountId" IS NOT NULL AND "whatsappAccountId" IS NULL)
    OR
    ("channel" = 'whatsapp' AND "igAccountId" IS NULL AND "whatsappAccountId" IS NOT NULL)
  );

ALTER TABLE public."sends"
  ADD CONSTRAINT "sends_channel_recipient_consistency"
  CHECK (
    ("channel" = 'instagram' AND "recipientPsid" IS NOT NULL AND "recipientPhone" IS NULL)
    OR
    ("channel" = 'whatsapp' AND "recipientPsid" IS NULL AND "recipientPhone" IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "idx_sends_whatsappAccountId_sentAt"
  ON public."sends"("whatsappAccountId", "sentAt" DESC)
  WHERE "whatsappAccountId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_sends_channel_status"
  ON public."sends"("channel", "status");

COMMIT;
