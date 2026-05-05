# Spec 012 — Marketing Site

> **MDD phase:** Document → Test → Code (compressed loop, single approval gate).
> **Implements:** §Appendix B item 12 of `docs/engineering-plan.md` —
> "marketing site: `/`, `/pricing`, `/compare/*` SEO pages".

**Status:** Awaiting approval — no code yet
**Branch:** `feat/spec-012-013-marketing-and-privacy`

---

## 1. Goal

Replace the placeholder `apps/web/app/page.tsx` with a real marketing surface.
After this spec ships, an unauthenticated visitor can:

1. Land on `/` and understand what AutomateBro does in <5 seconds.
2. See pricing tiers on `/pricing` (Free, Starter, Growth, Agency).
3. Compare AutomateBro against ManyChat, LinkPlease, and LinkDM at
   `/compare/manychat`, `/compare/linkplease`, `/compare/linkdm`.
4. Sign up via the persistent header CTA.
5. Find legal links (Privacy / Terms / DPA) in the footer — those pages
   are scaffolded here as **stubs** and filled in by spec 013.

All marketing routes are **public** (already allow-listed in
`apps/web/lib/auth/public-paths.ts`). They render statically (no `force-dynamic`)
so Vercel can cache them at the edge.

---

## 2. Out of scope

- Razorpay-driven checkout / plan purchase flow — lands in spec 010 (blocked
  on KYC).
- Real legal copy — privacy/terms pages get **placeholder text** here that
  spec 013 replaces with real content.
- Blog / changelog / case studies — post-launch.
- A/B testing, lead-magnet popups, exit-intent overlays — post-launch.
- Animations, hero video, customer logos — post-launch (we don't have
  customers yet).
- Localisation (en-IN vs en-US) — single English copy for v1.
- `/about`, `/careers`, `/contact` — single email link in footer is enough
  for v1.
- Newsletter signup — out of scope until we have content to send.

---

## 3. Architectural decisions

### 3.1 Route group `(marketing)` for shared layout

All marketing pages move into `apps/web/app/(marketing)/` so they can share
a header + footer via `(marketing)/layout.tsx` without leaking that chrome
into `/app/*` (dashboard) or `/login` (auth). Route groups don't affect
URLs — `(marketing)/page.tsx` still serves `/`.

This requires **deleting** the existing `apps/web/app/page.tsx` and moving
its content into `(marketing)/page.tsx`. Two `page.tsx` files for `/` is
a Next.js build error.

### 3.2 Static rendering by default

Marketing pages do **not** call `getCtx()`, do **not** read cookies, and
do **not** import any module that touches the database. Result: Next.js
treats them as fully static (`output: 'export'`-compatible) and Vercel
serves them from edge cache.

The auth pages (`/login`, `/signup`) and the dashboard already have
`export const dynamic = 'force-dynamic'` where they need it. Marketing
pages omit that directive on purpose.

### 3.3 Footer is a Server Component, header is a Client Component

The header has a mobile menu (open / closed state) — that's Client.
The footer is pure links → Server Component. Both live in
`apps/web/components/marketing/`.

### 3.4 Compare pages use a single dynamic route

`app/(marketing)/compare/[slug]/page.tsx` reads the slug, looks up the
competitor's pre-canned content from a typed map, and 404s on unknown
slugs. Three competitors today; adding a fourth is a one-entry diff.

Slugs allowed: `manychat`, `linkplease`, `linkdm`. Anything else →
`notFound()` from `next/navigation`.

### 3.5 SEO metadata

Each page exports `metadata` (title + description + OG tags). The
`metadataBase` is set in the marketing layout to `process.env.SITE_URL`
(falling back to `https://automatebro.com`). Sitemap and robots are
out of scope for v1 — Vercel auto-generates a basic sitemap from the
filesystem when we add `app/sitemap.ts` later.

### 3.6 Pricing — placeholder amounts, not Razorpay-wired

The pricing page shows tier amounts as static copy. The "Get started"
buttons link to `/signup?plan=<slug>` — the signup flow ignores `?plan`
in v1 (it lands in spec 010). This keeps the marketing page complete
without coupling to the unfinished billing path.

INR amounts (placeholders, finalised in spec 010):
- Free: ₹0 — 1 IG account, 50 DMs/day
- Starter: ₹999/mo — 1 IG account, unlimited DMs, AI replies
- Growth: ₹2,499/mo — 5 IG accounts, full feature set
- Agency: ₹6,999/mo — unlimited IG accounts, priority support

---

## 4. Files to create

### 4.1 Layout + chrome
- `apps/web/app/(marketing)/layout.tsx` — wraps every marketing page
  with `<Header />` + `<Footer />`. Sets `metadataBase`.
- `apps/web/components/marketing/header.tsx` — Client Component. Logo,
  nav links (Pricing, Compare ▾, Login, Sign up).
- `apps/web/components/marketing/footer.tsx` — Server Component.
  Columns: Product, Compare, Legal, Contact.
- `apps/web/components/marketing/compare-menu.tsx` — Client Component.
  Dropdown for the header's "Compare" item.

### 4.2 Pages
- `apps/web/app/(marketing)/page.tsx` — home (replaces existing
  `app/page.tsx`).
- `apps/web/app/(marketing)/pricing/page.tsx` — four pricing cards.
- `apps/web/app/(marketing)/compare/[slug]/page.tsx` — dynamic
  comparison page. Calls `notFound()` for unknown slugs.
- `apps/web/app/(marketing)/privacy/page.tsx` — **stub**, replaced in
  spec 013.
- `apps/web/app/(marketing)/terms/page.tsx` — **stub**, replaced in
  spec 013.
- `apps/web/app/(marketing)/dpa/page.tsx` — **stub**, replaced in
  spec 013.

### 4.3 Content
- `apps/web/app/(marketing)/compare/competitors.ts` — typed map of
  competitor → headline / strengths / weaknesses / verdict. Plain
  TypeScript, not a CMS — three competitors don't justify a CMS.

### 4.4 Files to delete
- `apps/web/app/page.tsx` — superseded by `(marketing)/page.tsx`.

### 4.5 Files to modify
- `apps/web/lib/auth/public-paths.ts` — add `/privacy`, `/terms`,
  `/dpa` to `PUBLIC_EXACT`. (Already has `/`, `/pricing`, `/compare/`.)

---

## 5. Tests

### 5.1 E2E (`tests/e2e/marketing.spec.ts`)

Per CLAUDE.md Critical Rule #4 (≥3 assertions per test):

1. **Home renders** — visit `/`, assert URL, assert hero text contains
   "Instagram DM", assert primary CTA links to `/signup`.
2. **Pricing renders** — visit `/pricing`, assert four pricing-tier
   cards visible, assert "Starter" card text contains "₹999".
3. **Compare manychat** — visit `/compare/manychat`, assert URL, assert
   page title contains "AutomateBro vs ManyChat", assert competitor
   verdict text appears.
4. **Compare unknown slug 404** — visit `/compare/wat`, assert 404
   status.
5. **Footer legal links** — visit `/`, assert footer contains links
   to `/privacy`, `/terms`, `/dpa`.
6. **Auth + protected redirect still works** — visit `/app/dashboard`
   without session, assert redirect to `/login`. (Sanity check: the
   marketing route group didn't accidentally wrap the dashboard.)

### 5.2 Unit (`apps/web/app/(marketing)/compare/competitors.test.ts`)

Optional — assert each competitor entry has the required keys
(headline, strengths.length ≥ 3, weaknesses.length ≥ 3). Catches
typos in the content map.

### 5.3 Public-paths regression (`apps/web/lib/auth/public-paths.test.ts`)

Add cases for `/privacy`, `/terms`, `/dpa` returning `true`. Assert
`/app/dashboard` and `/app/automations` still return `false`.

---

## 6. Acceptance criteria

- [x] `/`, `/pricing`, `/compare/manychat`, `/compare/linkplease`,
      `/compare/linkdm` all return 200 with no auth.
- [x] `/compare/anything-else` returns 404.
- [x] `/privacy`, `/terms`, `/dpa` return 200 with placeholder text.
- [x] Each page exports unique `<title>` + meta description.
- [x] Header CTA "Sign up" goes to `/signup`.
- [x] Footer legal links go to `/privacy`, `/terms`, `/dpa`.
- [x] No marketing page imports `@automatebro/shared/db/*` or calls
      `getCtx()`.
- [x] `pnpm --filter web exec next build` succeeds (Next.js will
      surface "two `/` routes" if we forgot to delete the old
      `app/page.tsx`).
- [x] `pnpm typecheck` passes.
- [x] All E2E tests in §5.1 pass.

---

## 7. What this spec does **not** change

- Authentication, session middleware, dashboard, API routes, worker
  jobs — untouched.
- StrictDB schemas, migrations — untouched.
- Razorpay, OpenAI, Meta integrations — untouched.

---

## 8. Risks

1. **Two `page.tsx` for `/`** — caught by `next build`, fixed by deleting
   the old one. Documented in §4.4.
2. **Static-render breakage** — if we accidentally import a server-only
   module (e.g. `@supabase/ssr`) into a marketing page, Vercel will
   fall back to dynamic rendering and lose the edge-cache win. Mitigation:
   E2E test asserts pages render without auth, so a runtime regression
   surfaces fast.
3. **Marketing copy is technical-founder-grade** — it's intentionally
   stubby. Real copywriting is a post-spec polish pass; the goal here
   is functional + searchable scaffolding.

---

## 9. Lessons we expect to learn (to backfill in CLAUDE.md after merge)

- Next.js App Router route groups `(marketing)` vs nested folders —
  when to reach for which.
- `notFound()` from `next/navigation` is the canonical 404 for dynamic
  routes; throwing or returning `null` doesn't trigger it.
- Static rendering opt-in — verifying via `next build` output that a
  page is `○` (static) vs `λ` (dynamic).
