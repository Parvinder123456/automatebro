-- Spec 003 §11 + code-review finding #5.
--
-- One-shot onboarding race: two concurrent POST /api/v1/tenants from
-- the same user could both pass hasExistingTenant() (no row yet) and
-- both insert. The pre-existing UNIQUE (tenantId, userId) doesn't help
-- because each request generates a different tenantId. A UNIQUE on
-- userId alone enforces "one tenant per user in v1" at the database
-- level — the second concurrent insert fails with a unique violation,
-- which the route surfaces as 409.
--
-- Note: this is a v1-only constraint. When tenant invitations land
-- (post-launch), we drop this and rely on application-layer logic
-- (a user CAN be in multiple tenants then).

ALTER TABLE public."tenantUsers"
  ADD CONSTRAINT "tenantUsers_userId_unique" UNIQUE ("userId");
