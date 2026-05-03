/**
 * Spec 003 — server-side ctx retrieval for Server Components and
 * Route Handlers.
 *
 * Bridges Next.js's @supabase/ssr cookie helpers (which can't live in
 * the @automatebro/shared package because that would force shared to
 * depend on next/headers) to the framework-agnostic getCtxFromUser()
 * in shared.
 */
import { cache } from 'react';
import { getCtxFromUser } from '@automatebro/shared/auth/ctx';
import type { Ctx } from '@automatebro/shared/auth/ctx';
import { createSupabaseServerClient } from '../supabase/server';

export const getCtx = cache(async (): Promise<Ctx | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return null;
  return getCtxFromUser({
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata as { name?: string | null } | null,
  });
});
