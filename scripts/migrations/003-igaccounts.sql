-- Spec 004 — igAccounts table.
--
-- Stores connected Instagram Business accounts. Page Access Tokens are
-- encrypted with AES-256-GCM before insert. tokenKeyVersion is reserved
-- for rotation (defaults to 1 in v1).

CREATE TABLE IF NOT EXISTS public."igAccounts" (
  "_id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "igUserId"                  TEXT NOT NULL,
  "igUsername"                TEXT NOT NULL,
  "pageId"                    TEXT NOT NULL,
  "pageName"                  TEXT,
  "accessTokenCiphertext"     BYTEA NOT NULL,
  "accessTokenIv"             BYTEA NOT NULL,
  "accessTokenTag"            BYTEA NOT NULL,
  "tokenKeyVersion"           INT NOT NULL DEFAULT 1,
  "tokenExpiresAt"            TIMESTAMPTZ,
  "scopes"                    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "webhookSubscribedAt"       TIMESTAMPTZ,
  "connectedAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "disconnectedAt"            TIMESTAMPTZ,
  UNIQUE ("tenantId", "igUserId")
);

CREATE INDEX IF NOT EXISTS "idx_igAccounts_tenantId" ON public."igAccounts"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_igAccounts_igUserId" ON public."igAccounts"("igUserId");
