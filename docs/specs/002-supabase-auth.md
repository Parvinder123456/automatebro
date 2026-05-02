# Spec 002 — Supabase Auth

> **MDD phase:** Document. Awaiting approval before tests are written.
> **Implements:** §Appendix B item 2 of `docs/engineering-plan.md`.
> **Depends on:** spec 001 (workspaces + StrictDB + Next.js shell on master).

**Status:** Draft, awaiting approval
**Branch:** `feat/spec-002-supabase-auth`
**Last updated:** 2026-04-30

---

## 1. Goal

Add user authentication (for **AutomateBro tenants** — i.e. the humans who
log in to manage their automations). After this spec ships, anyone can:

- Sign up with **email + password** (with email verification required).
- Sign up with **Google OAuth** (one-click).
- Sign in / sign out.
- Reset a forgotten password via email.
- Visit `/app/**` and see protected content (or be redirected to login).

**Tenant creation is NOT in this spec** — when a freshly signed-up user
hits `/app`, they get redirected to `/onboarding` which is a placeholder
page in 002. Spec 003 wires the actual `tenants` / `users` /
`tenantUsers` collection writes and the workspace-name form.

---

## 2. Out of scope (explicit)

These are deferred and **must not** be implemented in 002 even if it
would be one extra line:

- `tenants` / `users` / `tenantUsers` schemas → spec 003
- Workspace creation form → spec 003
- Multi-tenant context injection (`ctx`) → spec 003
- Role-based access control inside a tenant → spec 003
- Magic link sign-in → v1.5 (post-launch; reduces support load)
- TOTP / SMS multi-factor auth → v1.5
- Admin / staff portal at `/admin` → post-launch (use `pnpm db:query` for v1)
- Account deletion API (DPDP "right to erasure") → spec 013
- Email change flow → post-launch
- Tenant invitation flow (one user inviting another to their workspace) → spec 003 §future-extension
- Session revocation (logout-all-devices) → post-launch

---

## 3. Prerequisites — Supabase Auth configuration

Once the Supabase project from spec 001 §3.1 exists, you (the founder)
need to flip a few switches in the Supabase dashboard. **None of this is
code; all of it is clicks.** Document the values in `.env`.

### 3.1 Auth providers
**Supabase dashboard → Authentication → Providers**:

- **Email**: ✅ enabled (default).
  - **"Confirm email"**: ✅ ON (we want email verification).
  - **"Secure email change"**: ✅ ON (defence-in-depth even though we
    don't expose email-change in UI yet).
- **Google**: ✅ enabled.
  - Requires you to create a Google Cloud OAuth 2.0 client. The flow:
    1. https://console.cloud.google.com → APIs & Services → Credentials.
    2. Create OAuth 2.0 Client ID → Web application.
    3. **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`
       (Supabase shows the exact URL on the provider config page — copy
       from there, don't guess).
    4. Copy the Client ID + Client Secret back into Supabase.

### 3.2 Site URL & redirect URLs
**Supabase dashboard → Authentication → URL Configuration**:
- **Site URL**: `http://localhost:3000` (dev) — change to
  `https://automatebro.com` once domain is wired (post-launch).
- **Redirect URLs** (allow-list — Supabase rejects redirects to URLs not
  on this list):
  - `http://localhost:3000/api/v1/auth/callback`
  - `http://localhost:3001/api/v1/auth/callback`
  - `http://localhost:4010/api/v1/auth/callback`
  - `https://*.vercel.app/api/v1/auth/callback` (preview deployments)
  - `https://automatebro.com/api/v1/auth/callback` (production — add
    when domain is registered)

### 3.3 Email templates
**Supabase dashboard → Authentication → Email Templates**:
- The default templates work for v1. Spec 014 (or earlier if you have
  time) overrides them with branded copy. Note: the default sender is
  `noreply@mail.app.supabase.io` — replace with `noreply@automatebro.com`
  via Resend SMTP integration once the domain is verified.

### 3.4 Env vars
After §3.1 is done, fill these in `.env` (placeholders already exist
from spec 001):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...           # from Project Settings → API
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # from Project Settings → API (server-only)
```

Spec 002's env validator (extending `packages/shared/src/env.ts`) will
require these three.

---

## 4. Architectural decisions

### 4.1 Use `@supabase/ssr` (the official Next.js helper)
Supabase publishes `@supabase/ssr` which gives us three pre-built
clients tuned for the Next.js App Router:
- **Server client** — used in Server Components, Route Handlers, Server
  Actions. Reads/writes auth cookies via `next/headers`.
- **Browser client** — used in Client Components. Reads/writes auth
  cookies via `document.cookie`.
- **Middleware client** — used in `middleware.ts`. Refreshes the access
  token if expired, writes the new cookie back.

Why not roll our own: Supabase Auth's cookie format and refresh-token
rotation are non-trivial. The `@supabase/ssr` package is maintained by
Supabase, used by every Next.js + Supabase project, and gets security
fixes upstream. Rolling our own = future maintenance debt for zero gain.

### 4.2 Auth flows go directly to Supabase from the **browser** client
Email/password signup, login, password reset request, and OAuth
initiation **do not** go through our `/api/v1/*` endpoints. The browser
calls Supabase directly via `supabase.auth.signUp()` etc. The server
middleware syncs the resulting cookie.

Why not server-side: wrapping every Supabase Auth method in a custom
`/api/v1/auth/*` endpoint doubles the maintenance and adds zero
business logic. We add server-side endpoints only for the **callback**
(OAuth + email verification redirect URL handler) — that *must* be
server-side because it sets cookies on the redirect response.

This preserves CLAUDE.md Rule #2 ("every endpoint /api/v1/") because
Supabase Auth endpoints aren't *our* endpoints — they live on
`<ref>.supabase.co`.

### 4.3 Middleware decides public vs. authenticated
A single `middleware.ts` at the workspace root handles all routes. It:
1. Calls `@supabase/ssr`'s `createMiddlewareClient` to refresh the
   session cookie if needed.
2. Routes matching the **public** allow-list pass through unchanged.
3. Routes matching the **authenticated** patterns require a non-null
   `session.user`. Missing → 302 to `/login?returnTo=<original>`.
4. Routes for `/api/v1/webhooks/*` and `/api/v1/health` are public AND
   skip cookie refresh (webhooks have no cookie; health is fast-path).

### 4.4 No StrictDB writes in spec 002
Spec 002 *only* reads from Supabase Auth. The first StrictDB write
(into `users` and `tenants`) happens in spec 003, which runs after a
user signs up but before they reach `/app/dashboard`.

This is important because the project rule "every collection has
`tenantId`" doesn't apply yet — we haven't registered any collections.
Spec 003 is where multi-tenancy enforcement begins.

---

## 5. File layout (new files this spec creates)

```
apps/web/
├── app/
│   ├── (auth)/                         # route group — no layout
│   │   ├── login/page.tsx              # /login
│   │   ├── signup/page.tsx             # /signup
│   │   ├── forgot-password/page.tsx    # /forgot-password
│   │   ├── reset-password/page.tsx     # /reset-password
│   │   └── verify/page.tsx             # /verify (waiting page)
│   ├── (app)/                          # route group — authenticated
│   │   ├── layout.tsx                  # auth-required wrapper
│   │   ├── app/
│   │   │   └── page.tsx                # /app — placeholder, redirects to onboarding/dashboard
│   │   └── onboarding/
│   │       └── page.tsx                # /onboarding — placeholder
│   ├── logout/route.ts                 # /logout — POST clears session
│   └── api/v1/auth/
│       └── callback/route.ts           # OAuth + email-verify redirect target
├── lib/
│   └── supabase/
│       ├── browser.ts                  # createBrowserClient wrapper
│       ├── server.ts                   # createServerClient wrapper
│       └── middleware.ts               # createMiddlewareClient + refresh
├── middleware.ts                       # workspace-root Next.js middleware
└── components/
    └── auth/
        ├── login-form.tsx              # client component
        ├── signup-form.tsx             # client component
        ├── google-button.tsx           # OAuth trigger
        ├── forgot-password-form.tsx    # client component
        └── reset-password-form.tsx     # client component

packages/shared/src/
└── env.ts                              # extend Zod schema (SUPABASE_* now required)

tests/
├── e2e/
│   ├── auth-signup.spec.ts             # signup → email verify → onboarding
│   ├── auth-login.spec.ts              # login → /app
│   ├── auth-logout.spec.ts             # logout clears session
│   └── auth-protected-routes.spec.ts   # /app without session redirects to /login
└── integration/
    └── auth-helpers.test.ts            # Supabase admin API helpers used by E2E setup
```

**Files modified:**
- `apps/web/package.json` — add `@supabase/ssr`, `@supabase/supabase-js`
- `apps/web/app/page.tsx` — replace placeholder with marketing CTA linking to `/signup`
- `packages/shared/src/env.ts` — promote `SUPABASE_*` from optional to required
- `playwright.config.ts` — add `globalSetup` that creates a fixture test user via admin API

---

## 6. Auth flows (sequence diagrams in prose)

### 6.1 Email + password signup

1. Visitor → `GET /signup` → renders `signup-form.tsx` (client component).
2. Visitor fills email + password → click Submit.
3. Browser client: `supabase.auth.signUp({ email, password,
   options: { emailRedirectTo: '/api/v1/auth/callback' } })`.
4. Supabase: creates auth user with `email_confirmed_at: null`, sends
   verification email (link points back to our callback URL with a
   `token_hash`).
5. Browser: redirects to `/verify` with state "check your email."
6. User opens email → clicks verification link →
   `GET /api/v1/auth/callback?token_hash=...&type=signup&next=/app`.
7. Callback route: `supabase.auth.verifyOtp({ token_hash, type:
   'signup' })` → sets the auth cookie → 302 to `next` param (defaults
   to `/app`).
8. Middleware: sees authenticated user → routes to `/app/page.tsx`,
   which detects "no tenant yet" (spec 003 handles this; for spec 002
   it always redirects to `/onboarding` because no tenant logic exists).

### 6.2 Email + password login

1. Visitor → `GET /login?returnTo=/app/automations` (returnTo set by
   middleware on prior redirect, optional).
2. Visitor submits email + password.
3. Browser: `supabase.auth.signInWithPassword({ email, password })`.
4. On success: cookie is set on next response by `@supabase/ssr`.
   Browser redirects to `returnTo` or `/app`.
5. On failure (wrong password, unverified email): show inline error.

### 6.3 Google OAuth signup/login (same flow)

1. Visitor → `GET /signup` (or `/login`) → click "Continue with
   Google" button.
2. Browser: `supabase.auth.signInWithOAuth({ provider: 'google',
   options: { redirectTo: '/api/v1/auth/callback?next=/app' } })`.
3. Browser redirects to Google's consent screen.
4. User approves → Google redirects to Supabase Auth callback URL
   (`https://<ref>.supabase.co/auth/v1/callback`).
5. Supabase exchanges code for tokens, then redirects to **our**
   callback URL (`/api/v1/auth/callback?code=...&next=/app`).
6. Our callback: `supabase.auth.exchangeCodeForSession(code)` → cookie
   set → 302 to `next` (defaults to `/app`).

### 6.4 Logout

1. User clicks "Sign out" in nav (renders a `<form action="/logout"
   method="POST">`).
2. `POST /logout` route handler: `supabase.auth.signOut()` → cookie
   cleared → 302 to `/`.

### 6.5 Forgot password

1. Visitor → `/forgot-password` → enter email → submit.
2. Browser: `supabase.auth.resetPasswordForEmail(email,
   { redirectTo: '/reset-password' })`.
3. Supabase sends reset email with magic link.
4. User clicks link → lands on `/reset-password` with a recovery token
   in the URL hash (handled client-side by `@supabase/ssr`).
5. User enters new password → `supabase.auth.updateUser({ password })`.
6. Redirect to `/login` with success message.

### 6.6 Protected-route redirect (cold visit)

1. Visitor without session → `GET /app/automations`.
2. Middleware: no `session.user` → 302 to
   `/login?returnTo=/app/automations`.
3. Visitor logs in → flow 6.2 → returnTo = `/app/automations`.

---

## 7. Middleware contract

`apps/web/middleware.ts`:

```ts
// pseudocode
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PREFIXES = [
  '/',                   // exact match handled below
  '/pricing',
  '/compare',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/api/v1/auth/callback',
  '/api/v1/health',
];

const PUBLIC_PREFIX_API_WEBHOOKS = '/api/v1/webhooks/';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Webhooks have no auth; skip all session work.
  if (pathname.startsWith(PUBLIC_PREFIX_API_WEBHOOKS)) {
    return NextResponse.next();
  }

  // Refresh session cookie (returns the response with refreshed cookie).
  const { response, user } = await updateSession(request);

  // Public allow-list passes through.
  if (isPublicPath(pathname)) return response;

  // Authenticated routes require a user.
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static files and Next internals.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**Behavioural specifics:**
- `pathname === '/'` → public.
- `pathname` in `PUBLIC_PREFIXES` (exact or prefix-matched) → public.
- `pathname.startsWith('/api/v1/webhooks/')` → public, **no cookie work**.
- `pathname.startsWith('/api/v1/health')` → public, **no cookie work**.
- Everything else under `/api/v1/*` → authenticated.
- `/app/*`, `/onboarding`, `/admin/*` → authenticated.
- Unauthenticated request to `/api/v1/automations/...` → returns 401
  JSON, NOT a 302 (API consumers should get a clean error).

---

## 8. Routes & endpoints introduced

| Method | Path | Purpose | Auth required |
|---|---|---|---|
| GET | `/signup` | UI: signup form | No |
| GET | `/login` | UI: login form | No |
| GET | `/forgot-password` | UI: enter email for reset | No |
| GET | `/reset-password` | UI: set new password (recovery token in URL hash) | No |
| GET | `/verify` | UI: "check your email" waiting page | No |
| GET | `/api/v1/auth/callback` | Server: OAuth code exchange + email-verify token check | No (callback) |
| POST | `/logout` | Server: sign out + clear cookie + redirect | Yes |
| GET | `/onboarding` | UI: placeholder for spec 003 | Yes |
| GET | `/app` | UI: redirects to `/onboarding` (no tenant yet) | Yes |

**No new business-logic endpoints** — Supabase Auth's own endpoints
handle signup/login/reset. We just wrap the callback.

---

## 9. Env vars (extending `packages/shared/src/env.ts`)

Promote three vars from optional to **required** in this spec:

```ts
// before (spec 001)
SUPABASE_URL: z.string().url().optional(),
SUPABASE_ANON_KEY: z.string().min(1).optional(),
SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

// after (spec 002)
SUPABASE_URL: z.string().url(),
SUPABASE_ANON_KEY: z.string().min(1),
SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are exposed to the browser via
`NEXT_PUBLIC_*` aliases (the browser client needs them). Convention:

```ts
NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
```

Server-only:
- `SUPABASE_SERVICE_ROLE_KEY` (used in tests + future server tasks; **never** in browser bundles).

`.env.example` updated to reflect both prefixed and unprefixed forms.

---

## 10. Acceptance criteria (drives the test phase)

### 10.1 Unit tests (Vitest, no infra)
- **U1 — env requires SUPABASE_URL**: `Env.parse({ STRICTDB_URI, REDIS_URL,
  NEXT_PUBLIC_SUPABASE_URL, ... })` without `SUPABASE_URL` throws.
- **U2 — env requires NEXT_PUBLIC_SUPABASE_URL**: same shape but missing the
  public-prefixed one throws.
- **U3 — `isPublicPath('/')` returns true**.
- **U4 — `isPublicPath('/login')` returns true**.
- **U5 — `isPublicPath('/api/v1/webhooks/meta')` returns true**.
- **U6 — `isPublicPath('/app/dashboard')` returns false**.
- **U7 — `isPublicPath('/api/v1/automations')` returns false**.

### 10.2 Integration tests (Vitest, real Supabase Auth)
- **I1 — admin createUser then deleteUser**: `auth.admin.createUser({ email,
  password, email_confirm: true })` returns a user; `admin.deleteUser(id)`
  removes them. (Smoke test of admin API used by E2E setup.)
- **I2 — signin with correct password returns a session**: programmatic
  signin returns `{ data: { session }, error: null }`.
- **I3 — signin with wrong password returns AuthApiError**: returns an
  error with code `invalid_credentials`.
- **I4 — unverified user cannot sign in**: create user without
  `email_confirm: true`, attempt login, assert error message references
  email confirmation.

### 10.3 E2E tests (Playwright)
- **E1 — signup happy path**:
  - Navigate to `/signup`.
  - Fill email + password (a fresh email per test run via timestamp).
  - Submit.
  - Assert redirect to `/verify` with "check your email" copy visible.
  - Use Supabase admin API to programmatically verify the email
    (skip the inbox click).
  - Programmatically sign in via the browser client (or use a fresh
    storage state).
  - Visit `/app` → assert redirect to `/onboarding`.
  - Assert URL is `/onboarding`, page contains "workspace name" copy
    (placeholder text), no errors in console.
- **E2 — login happy path**:
  - Pre-create a verified user via fixture.
  - Navigate to `/login`.
  - Fill email + password → submit.
  - Assert URL is `/app` → redirected to `/onboarding`.
  - Assert auth cookie exists.
- **E3 — login wrong password**:
  - Pre-create user.
  - Submit wrong password.
  - Assert URL is still `/login` and an error message contains
    "invalid" or "incorrect."
- **E4 — protected route without session redirects to login**:
  - No cookie present.
  - Visit `/app/dashboard`.
  - Assert URL is `/login?returnTo=%2Fapp%2Fdashboard`.
  - After login, assert redirect goes back to `/app/dashboard`.
- **E5 — logout clears session**:
  - Pre-authenticated session.
  - Visit `/app` → assert authenticated.
  - POST to `/logout`.
  - Visit `/app` → assert redirect to `/login`.
- **E6 — public routes accessible without auth**:
  - No cookie.
  - GET `/`, `/pricing` (placeholder), `/login`, `/signup`,
    `/api/v1/health`, `/api/v1/webhooks/meta` (POST with bogus body —
    expect 401 from signature check, NOT a redirect).
  - Assert each returns 200 / its own status, NOT a 302 to `/login`.

Each E2E test meets CLAUDE.md Rule #4 (URL + element + data assertions).

### 10.4 Configuration tests
- **C1 — `pnpm typecheck` passes**.
- **C2 — `pnpm build` produces bundles**.
- **C3 — `pnpm lint` clean**.
- **C4 — auth-related files all under quality gates** (no file > 300
  lines, no function > 50 lines).

### 10.5 Security tests
- **S1 — `SUPABASE_SERVICE_ROLE_KEY` never appears in browser bundle**:
  grep `apps/web/.next/` after build for the string `service_role` and
  the literal value of the env var (read from `.env`). Both must be 0
  hits.
- **S2 — auth cookies are HttpOnly**: in E2E, after login, inspect the
  Supabase auth cookie via `context.cookies()` and assert `httpOnly:
  true`, `sameSite: 'Lax'`, `secure: true` (in production-mode build,
  not `pnpm dev`).

---

## 11. Risks & open questions

1. **Email verification email lands in spam.** Default Supabase sender
   is `noreply@mail.app.supabase.io`, which has a poor reputation for
   transactional email. Spec 014 (or earlier) replaces with Resend SMTP
   integration once `automatebro.com` is registered. **Risk for v1
   private beta:** users miss the email and bounce. **Mitigation:** add
   a "resend verification email" button on `/verify` (covered in this
   spec under E1's flow).

2. **Google OAuth domain restriction in dev.** The OAuth client
   redirect URIs we configure include `localhost` and `*.vercel.app`,
   but Google may flag this as "unverified app" in dev. For private
   beta, the warning is acceptable. For public launch, we submit the
   OAuth app for verification (takes 1–4 weeks per Google).

3. **Race between signup and onboarding.** A user signs up → verifies
   email → lands on `/onboarding`. Spec 003 will create the
   `tenants` row at that point. If they bookmark `/app/dashboard` and
   visit before completing onboarding, middleware lets them in (they're
   authenticated). Spec 003 must add a second middleware check that
   "if no tenant exists for this user, redirect to `/onboarding`."

4. **Supabase Auth user vs. our `users` collection.** Supabase Auth
   stores users in its own `auth.users` table. We will mirror them in
   our `users` collection in spec 003 (StrictDB → public.users) so we
   can JOIN against `tenantUsers`. The mirror writes happen in spec 003,
   not 002. Until then, "user" means "Supabase Auth user."

5. **Test user fixtures pollute the dev Supabase project.** E2E tests
   create real users in Supabase. Cleanup is essential — Playwright
   `globalTeardown` deletes any user with email matching
   `e2e+*@automatebro.test`. **Recommendation:** create a separate
   Supabase project `automatebro-staging` for tests, kept distinct from
   `automatebro-prod`. Optional for v1.

6. **Browser bundle size with `@supabase/supabase-js`.** The package
   is ~50 KB gzipped — not tiny but acceptable. If it bloats, we can
   tree-shake by using `@supabase/auth-js` directly. v1 takes the
   convenience.

7. **CSRF on `/logout`.** Using a `<form method="POST">` to `/logout`
   sets the SameSite=Lax cookie semantics, which is sufficient
   protection for a non-state-changing logout. For destructive
   endpoints later (delete tenant, etc.), we'll add explicit CSRF
   tokens via `next-csrf` or similar.

8. **No SAML / SSO for enterprise.** Out of scope for v1. Supabase
   supports it on paid tiers; revisit when we have an enterprise
   customer.

---

## 12. Definition of done

- [ ] All files in §5 exist on `feat/spec-002-supabase-auth`.
- [ ] `.env` filled with real `SUPABASE_*` values (you must do this —
      can't be merged blind).
- [ ] Supabase Auth providers configured per §3.1.
- [ ] All §10 tests pass (with valid Supabase project).
- [ ] `git diff master...HEAD` reviewed by user.
- [ ] `code-reviewer` subagent run + findings addressed.
- [ ] Branch fast-forward merged into `master`.
- [ ] Commit message: `feat(auth): supabase auth — signup, login,
      session middleware, protected routes`.

---

## 13. After approval

Per the MDD loop:

1. **Test phase** — write all §10 tests as failing tests (auth-helpers
   integration tests + 6 E2E tests + 7 unit tests). Stop for approval.
2. **Code phase** — implement Supabase clients, middleware, auth pages,
   callback route. Stop for approval.
3. **Review subagent** — `code-reviewer` against the diff. Stop for
   approval.
4. **Merge** — fast-forward into `master`.

Then move to spec 003 (`003-tenants-and-users.md`) on a new branch.

---

**END OF SPEC — awaiting approval. Do not begin §10 tests until this
doc is accepted.**
