-- Spec 015 — extend automations.trigger CHECK constraint to allow 'dm'.
--
-- The original constraint (migration 005) was inline:
--   "trigger" TEXT NOT NULL CHECK ("trigger" IN ('comment','storyReply','mention'))
-- Postgres auto-named it `automations_trigger_check`.
--
-- We DROP + ADD inside one transaction so no insert can sneak through
-- with a value the new constraint would reject. Postgres holds a brief
-- exclusive lock on the constraint; runtime impact sub-millisecond on a
-- table with a few hundred rows.
--
-- IF EXISTS makes this re-runnable. The new constraint is named
-- explicitly so a future spec can ALTER it the same way without guessing
-- the auto-name.

BEGIN;

ALTER TABLE public."automations"
  DROP CONSTRAINT IF EXISTS "automations_trigger_check";

ALTER TABLE public."automations"
  ADD CONSTRAINT "automations_trigger_check"
  CHECK ("trigger" IN ('comment','dm','storyReply','mention'));

COMMIT;
