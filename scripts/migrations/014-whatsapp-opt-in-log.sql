-- Spec 026 — whatsappOptInLog table.
--
-- Immutable audit log of opt-in / opt-out events. DPDP + Meta require
-- a provable trail. Append-only: handlers never UPDATE or DELETE rows
-- here. There's no operator-facing edit path either (clearing an opt-out
-- requires the customer to re-engage).
--
-- 'evidence' captures whatever proof we can: the inbound wamid (for
-- whatsapp_inbound), a form submission ID (web_form), or operator note
-- (admin_override).
--
-- Index supports "what's the latest action for this phone?" lookups
-- which gate every template send.

CREATE TABLE IF NOT EXISTS public."whatsappOptInLog" (
  "_id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "whatsappAccountId"    UUID NOT NULL REFERENCES public."whatsappAccounts"("_id") ON DELETE CASCADE,
  "phone"                TEXT NOT NULL,
  "action"               TEXT NOT NULL CHECK ("action" IN ('optIn','optOut')),
  "source"               TEXT NOT NULL
    CHECK ("source" IN ('whatsapp_inbound','stop_keyword','web_form','admin_override')),
  "evidence"             TEXT,
  "recordedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_whatsappOptInLog_tenantId_phone_recordedAt"
  ON public."whatsappOptInLog"("tenantId", "phone", "recordedAt" DESC);
