-- Spec 007 — automations, triggers, responses, sends.

CREATE TABLE IF NOT EXISTS public."automations" (
  "_id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "igAccountId"  UUID NOT NULL REFERENCES public."igAccounts"("_id") ON DELETE CASCADE,
  "name"         TEXT NOT NULL,
  "trigger"      TEXT NOT NULL CHECK ("trigger" IN ('comment','storyReply','mention')),
  "status"       TEXT NOT NULL DEFAULT 'active'
                   CHECK ("status" IN ('active','paused','archived')),
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."triggers" (
  "_id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "automationId" UUID NOT NULL REFERENCES public."automations"("_id") ON DELETE CASCADE,
  "keywords"     TEXT[] NOT NULL,
  "matchMode"    TEXT NOT NULL DEFAULT 'contains'
                   CHECK ("matchMode" IN ('contains','exact','startsWith')),
  "postIds"      TEXT[]
);

CREATE TABLE IF NOT EXISTS public."responses" (
  "_id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "automationId"    UUID NOT NULL REFERENCES public."automations"("_id") ON DELETE CASCADE,
  "mode"            TEXT NOT NULL DEFAULT 'static'
                      CHECK ("mode" IN ('static','ai')),
  "template"        TEXT,
  "aiPrompt"        TEXT,
  "aiTone"          TEXT CHECK ("aiTone" IN ('friendly','professional','playful')),
  "fallbackTemplate" TEXT,
  "commentReply"    TEXT
);

CREATE TABLE IF NOT EXISTS public."sends" (
  "_id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "igAccountId"   UUID NOT NULL REFERENCES public."igAccounts"("_id") ON DELETE CASCADE,
  "automationId"  UUID REFERENCES public."automations"("_id") ON DELETE SET NULL,
  "eventId"       UUID REFERENCES public."events"("_id") ON DELETE SET NULL,
  "recipientPsid" TEXT NOT NULL,
  "kind"          TEXT NOT NULL CHECK ("kind" IN ('dm','commentReply')),
  "content"       TEXT NOT NULL,
  "aiGenerated"   BOOLEAN NOT NULL DEFAULT false,
  "status"        TEXT NOT NULL
                    CHECK ("status" IN ('queued','sent','failed','rateLimited','outsideWindow')),
  "metaMessageId" TEXT,
  "errorCode"     TEXT,
  "errorMessage"  TEXT,
  "attempt"       INT NOT NULL DEFAULT 1,
  "queuedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "sentAt"        TIMESTAMPTZ,
  "failedAt"      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_automations_tenantId_status"
  ON public."automations"("tenantId","status");
CREATE INDEX IF NOT EXISTS "idx_automations_igAccountId"
  ON public."automations"("igAccountId");
CREATE INDEX IF NOT EXISTS "idx_triggers_automationId" ON public."triggers"("automationId");
CREATE INDEX IF NOT EXISTS "idx_responses_automationId" ON public."responses"("automationId");
CREATE INDEX IF NOT EXISTS "idx_sends_tenantId_status" ON public."sends"("tenantId","status");
CREATE INDEX IF NOT EXISTS "idx_sends_igAccountId_sentAt"
  ON public."sends"("igAccountId","sentAt" DESC);
