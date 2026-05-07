-- Spec 026 — extend responses with whatsappTemplateId.
--
-- When an automation has trigger='whatsappMessage' and mode='static',
-- the response can either be freeform (template column, in-window only)
-- or a template (whatsappTemplateId, sendable any time within tier
-- limits). The handler decides which to send based on the recipient's
-- service-window state at send time.
--
-- Backwards compatible: existing IG responses don't reference this
-- column, NULL for them. No data change.

BEGIN;

ALTER TABLE public."responses"
  ADD COLUMN IF NOT EXISTS "whatsappTemplateId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'responses_whatsappTemplateId_fkey'
  ) THEN
    ALTER TABLE public."responses"
      ADD CONSTRAINT "responses_whatsappTemplateId_fkey"
      FOREIGN KEY ("whatsappTemplateId")
      REFERENCES public."whatsappTemplates"("_id")
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
