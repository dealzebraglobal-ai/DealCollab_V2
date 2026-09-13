import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * DealCollab — canonical session → DB user resolution
 * =====================================================
 * WhatsApp-authenticated sessions (magic-link → phone Credentials provider)
 * carry a real `session.user.id` and `session.user.phone`, but `session.user.email`
 * is only ever the placeholder `<phone>@dealcollab.ai` stamped at user creation —
 * and is NOT guaranteed to still match `users.email` (e.g. after Google account
 * linking rewrites it to a real address). Routes that resolve the acting user by
 * `.eq('email', session.user.email)` ALONE will 404 for exactly these sessions,
 * even though the user is genuinely authenticated and owns real data.
 *
 * /api/deals discovered and fixed this ("supports ID, Email, and Phone for
 * WhatsApp users") but the fix was never propagated to the other routes in the
 * mandate-viewing surface (/api/matches/detail/[matchId], /api/matches/[proposalID],
 * /api/eois) — which is why "View Mandate" / "View Matches" / "Send EOI" could
 * fail specifically for WhatsApp-filed mandates while the Deal Log list (already
 * using this resolution order) rendered them fine. This is the one shared
 * implementation both paths should use.
 */
export interface SessionUserLike {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ResolvedDbUser {
  id: string;
  [key: string]: unknown;
}

/**
 * Resolves the authenticated `users` row for a NextAuth session, trying — in
 * order — id, then email, then phone. Any one succeeding is sufficient; this
 * mirrors /api/deals/route.ts exactly so ownership checks agree across the app
 * regardless of which channel (web login vs. WhatsApp magic link) issued the session.
 *
 * @param columns Postgrest select list, e.g. 'id, tokens'. Defaults to 'id'.
 */
export async function resolveDbUser<T extends ResolvedDbUser = ResolvedDbUser>(
  supabase: SupabaseClient,
  authUser: SessionUserLike | null | undefined,
  columns = 'id',
): Promise<T | null> {
  if (!authUser?.id && !authUser?.email && !authUser?.phone) return null;

  if (authUser.id) {
    const { data } = await supabase.from('users').select(columns).eq('id', authUser.id).single();
    if (data) return data as unknown as T;
  }

  if (authUser.email) {
    const { data } = await supabase.from('users').select(columns).eq('email', authUser.email).single();
    if (data) return data as unknown as T;
  }

  if (authUser.phone) {
    const { data } = await supabase.from('users').select(columns).eq('phone', authUser.phone).single();
    if (data) return data as unknown as T;
  }

  return null;
}
