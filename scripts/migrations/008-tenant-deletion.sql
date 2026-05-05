-- Spec 013 — DPDP / privacy.
--
-- Adds the deletion-requested timestamp on tenants. Pairs with the
-- existing `deletedAt` column (created in migration 001):
--
--   - `deletedAt`               — set immediately when the tenant clicks
--                                 "Delete workspace". Soft-delete signal;
--                                 buildCtx() treats this row as if it
--                                 didn't exist for the user.
--   - `deletionRequestedAt`     — same timestamp, copied separately so
--                                 we never lose the original request
--                                 time even if an operator un-deletes
--                                 (clears `deletedAt`) and re-deletes.
--
-- The 30-day hard-delete cron (lands in spec 014) reads
-- `deletionRequestedAt` to decide whether the soft-delete grace period
-- has elapsed.

ALTER TABLE public."tenants"
  ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "idx_tenants_deletionRequestedAt"
  ON public."tenants"("deletionRequestedAt")
  WHERE "deletionRequestedAt" IS NOT NULL;
