-- Spec 026 — whatsappAccounts table.
--
-- Per-tenant WhatsApp Business Account connection. Mirrors igAccounts:
-- AES-256-GCM encrypted access token (AAD = phoneNumberId for row-swap
-- defence per spec 003 lessons), connection lifecycle timestamps,
-- Meta-issued tier + quality rating refreshed nightly.
--
-- One row per (tenant, phone number). The phoneNumberId is globally
-- unique across all tenants (Meta-issued ID); we enforce that with a
-- unique constraint to catch accidental cross-tenant reuse.
--
-- dailyConversationCap defaults to 100 — the v1 guardrail against
-- runaway sends (spec 026 §7.2). Operators raise it on plan upgrade.

CREATE TABLE IF NOT EXISTS public."whatsappAccounts" (
  "_id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "wabaId"                    TEXT NOT NULL,
  "phoneNumberId"             TEXT NOT NULL,
  "displayPhoneNumber"        TEXT NOT NULL,
  "verifiedName"              TEXT,
  "accessTokenCiphertext"     BYTEA NOT NULL,
  "accessTokenIv"             BYTEA NOT NULL,
  "accessTokenTag"            BYTEA NOT NULL,
  "tokenKeyVersion"           INT NOT NULL DEFAULT 1,
  "messagingTier"             TEXT
    CHECK ("messagingTier" IN ('tier1','tier2','tier3','tier4')),
  "qualityRating"             TEXT
    CHECK ("qualityRating" IN ('green','yellow','red','unknown')),
  "dailyConversationCap"      INT NOT NULL DEFAULT 100 CHECK ("dailyConversationCap" > 0),
  "scopes"                    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "webhookSubscribedAt"       TIMESTAMPTZ,
  "connectedAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "disconnectedAt"            TIMESTAMPTZ,
  UNIQUE ("phoneNumberId")
);

CREATE INDEX IF NOT EXISTS "idx_whatsappAccounts_tenantId"
  ON public."whatsappAccounts"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_whatsappAccounts_wabaId"
  ON public."whatsappAccounts"("wabaId");
