/**
 * Supabase client for browser (Client Component) use.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from
 * the client-side env (these are baked into the JS bundle at build
 * time). Uses cookies for session persistence — not localStorage —
 * so the same session is visible to server components and middleware.
 *
 * Spec 002 §4.1.
 */
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    // biome-ignore lint/style/noNonNullAssertion: NEXT_PUBLIC_* vars are validated at build time
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: NEXT_PUBLIC_* vars are validated at build time
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
