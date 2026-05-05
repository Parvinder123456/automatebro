-- Spec 016 — AI intent classifier (smart triggers).
--
-- Adds:
--   events.intent             — classified intent label (or NULL)
--   events.intentConfidence   — classifier confidence (0..1) or NULL
--   triggers.intents          — optional intent filter on a trigger;
--                               NULL or empty = "fire on any intent"
--
-- Intent labels are validated at the Zod boundary, not the SQL CHECK,
-- so future label additions don't need a migration.
--
-- All ALTER TABLE statements use IF NOT EXISTS so re-runs are safe.

ALTER TABLE public."events"
  ADD COLUMN IF NOT EXISTS "intent" TEXT;

ALTER TABLE public."events"
  ADD COLUMN IF NOT EXISTS "intentConfidence" DOUBLE PRECISION;

ALTER TABLE public."triggers"
  ADD COLUMN IF NOT EXISTS "intents" TEXT[];

-- Partial index for common dashboard query: "show me last week's
-- buying-intent comments". Small index since most events stay
-- unclassified-at-rest until a feature touches them.
CREATE INDEX IF NOT EXISTS "idx_events_tenant_intent"
  ON public."events"("tenantId", "intent")
  WHERE "intent" IS NOT NULL;
