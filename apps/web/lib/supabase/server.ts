import { loadEnv } from '@automatebro/shared/env';
/**
 * Supabase client for Server Component / Route Handler / Server Action use.
 *
 * Reads + writes auth cookies via next/headers. Pass-through to
 * @supabase/ssr's createServerClient with the cookies adapter.
 *
 * Spec 002 §4.1. Cookie behaviour follows @supabase/ssr defaults:
 *   - HttpOnly, Secure (in production), SameSite=Lax
 *   - Refresh-token rotation handled internally
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const env = loadEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; this is fine — the
          // middleware refreshes the session before the request reaches
          // the component, and the route handler / action paths can
          // set cookies (they hit the catch in RSC only).
        }
      },
    },
  });
}
