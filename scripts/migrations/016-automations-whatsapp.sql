-- Spec 026 — extend automations for WhatsApp:
--   1. Allow trigger='whatsappMessage' (CHECK extension)
--   2. Add whatsappAccountId nullable column + FK
--   3. Relax igAccountId to nullable so WA-only automations are valid
--   4. Add CHECK that exactly one of igAccountId / whatsappAccountId is set
--
-- The original automations_trigger_check is the second time we extend
-- it (first was migration 009 for 'dm'). Same DROP + ADD pattern.
--
-- Relaxing igAccountId NOT NULL is safe because every existing row
-- already has it set (the original column had DEFAULT NULL but NOT
-- NULL constraint; flipping the constraint doesn't touch the data).
-- The new exactly-one CHECK enforces the invariant going forward.

BEGIN;

-- 1. Extend trigger CHECK.
ALTER TABLE public."automations"
  DROP CONSTRAINT IF EXISTS "automations_trigger_check";

ALTER TABLE public."automations"
  ADD CONSTRAINT "automations_trigger_check"
  CHECK ("trigger" IN ('comment','dm','storyReply','mention','whatsappMessage'));

-- 2. Add whatsappAccountId column.
ALTER TABLE public."automations"
  ADD COLUMN IF NOT EXISTS "whatsappAccountId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'automations_whatsappAccountId_fkey'
  ) THEN
    ALTER TABLE public."automations"
      ADD CONSTRAINT "automations_whatsappAccountId_fkey"
      FOREIGN KEY ("whatsappAccountId")
      REFERENCES public."whatsappAccounts"("_id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Relax igAccountId NOT NULL.
ALTER TABLE public."automations"
  ALTER COLUMN "igAccountId" DROP NOT NULL;

-- 4. Exactly-one CHECK. Existing rows all have igAccountId set, so
--    this constraint passes for them.
ALTER TABLE public."automations"
  DROP CONSTRAINT IF EXISTS "automations_account_xor";

ALTER TABLE public."automations"
  ADD CONSTRAINT "automations_account_xor"
  CHECK (
    ("igAccountId" IS NOT NULL AND "whatsappAccountId" IS NULL)
    OR
    ("igAccountId" IS NULL AND "whatsappAccountId" IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "idx_automations_whatsappAccountId_status"
  ON public."automations"("whatsappAccountId", "status")
  WHERE "whatsappAccountId" IS NOT NULL;

COMMIT;
