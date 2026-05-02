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

import { PublicEnv } from '@automatebro/shared/env';
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(PublicEnv.SUPABASE_URL, PublicEnv.SUPABASE_ANON_KEY);
}
