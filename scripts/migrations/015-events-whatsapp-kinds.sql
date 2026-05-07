-- Spec 026 — extend events.kind CHECK to allow WhatsApp kinds, plus
-- add whatsappAccountId column.
--
-- The original constraint (migration 004) was inline:
--   "kind" TEXT NOT NULL CHECK ("kind" IN
--     ('comment','message','storyReply','messageReaction','mention'))
-- Postgres auto-named it `events_kind_check`. We DROP + ADD inside one
-- transaction so no insert can sneak through with a value the new
-- constraint would reject.
--
-- whatsappAccountId is nullable for backward compatibility with all
-- existing IG events (which are NULL) and forward compatibility with
-- new WA events (which set it). FK has ON DELETE SET NULL so deleting
-- a connected WABA preserves the event log.

BEGIN;

ALTER TABLE public."events"
  DROP CONSTRAINT IF EXISTS "events_kind_check";

ALTER TABLE public."events"
  ADD CONSTRAINT "events_kind_check"
  CHECK ("kind" IN (
    'comment',
    'message',
    'storyReply',
    'messageReaction',
    'mention',
    'whatsappMessage',
    'whatsappStatus',
    'whatsappTemplateStatus'
  ));

ALTER TABLE public."events"
  ADD COLUMN IF NOT EXISTS "whatsappAccountId" UUID;

-- FK added separately so re-runs are safe (ALTER TABLE … ADD CONSTRAINT
-- IF NOT EXISTS isn't supported on FK constraints; use a DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_whatsappAccountId_fkey'
  ) THEN
    ALTER TABLE public."events"
      ADD CONSTRAINT "events_whatsappAccountId_fkey"
      FOREIGN KEY ("whatsappAccountId")
      REFERENCES public."whatsappAccounts"("_id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index for "WA events for this tenant by time" — mirror of the IG
-- index established in migration 004.
CREATE INDEX IF NOT EXISTS "idx_events_whatsappAccountId_receivedAt"
  ON public."events"("whatsappAccountId", "receivedAt" DESC)
  WHERE "whatsappAccountId" IS NOT NULL;

COMMIT;
