-- Spec 005 — events table.
--
-- Immutable log of every Meta webhook delivery. Unique constraint on
-- metaEventId is the idempotency gate — duplicate deliveries hit the
-- unique-violation and are silently no-oped.

CREATE TABLE IF NOT EXISTS public."events" (
  "_id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          UUID REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "metaEventId"       TEXT NOT NULL UNIQUE,
  "kind"              TEXT NOT NULL
                        CHECK ("kind" IN (
                          'comment','message','storyReply','messageReaction','mention'
                        )),
  "igAccountId"       UUID REFERENCES public."igAccounts"("_id") ON DELETE SET NULL,
  "payload"           JSONB NOT NULL,
  "signatureVerified" BOOLEAN NOT NULL,
  "receivedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processedAt"       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_events_tenantId_kind_receivedAt"
  ON public."events"("tenantId", "kind", "receivedAt");
CREATE INDEX IF NOT EXISTS "idx_events_processedAt_receivedAt"
  ON public."events"("processedAt", "receivedAt");
CREATE INDEX IF NOT EXISTS "idx_events_igAccountId"
  ON public."events"("igAccountId");
