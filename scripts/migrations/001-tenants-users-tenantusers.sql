-- Spec 003 — first migration. Creates tenants, users, tenantUsers.
--
-- Naming convention: StrictDB uses the same identifier in the database
-- as in app code. Since our app code uses camelCase collection + field
-- names ("tenantUsers", "tenantId", "createdAt"), the SQL identifiers
-- are also camelCase, quoted for case preservation. Postgres folds
-- unquoted identifiers to lowercase, so the quotes are mandatory here.
--
-- This is the agreed convention going forward — every future
-- migration uses quoted camelCase identifiers.

CREATE TABLE IF NOT EXISTS public."tenants" (
  "_id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"            TEXT NOT NULL,
  "slug"            TEXT NOT NULL UNIQUE,
  "plan"            TEXT NOT NULL DEFAULT 'free'
                      CHECK ("plan" IN ('free', 'starter', 'growth', 'agency')),
  "dpdpConsentAt"   TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public."users" (
  -- _id mirrors auth.users.id (Supabase Auth) for direct correspondence.
  "_id"        UUID PRIMARY KEY,
  "email"      TEXT NOT NULL UNIQUE,
  "name"       TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."tenantUsers" (
  "_id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "userId"       UUID NOT NULL REFERENCES public."users"("_id") ON DELETE CASCADE,
  "role"         TEXT NOT NULL CHECK ("role" IN ('owner', 'admin', 'member')),
  "invitedAt"    TIMESTAMPTZ,
  "acceptedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "userId")
);

CREATE INDEX IF NOT EXISTS "idx_tenantUsers_userId"
  ON public."tenantUsers"("userId");
CREATE INDEX IF NOT EXISTS "idx_tenantUsers_tenantId"
  ON public."tenantUsers"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_tenants_slug"
  ON public."tenants"("slug");
