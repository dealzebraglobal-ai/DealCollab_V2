/**
 * DealCollab — consent (server helpers)
 * ======================================
 * Single source of truth for terms version and acceptance gate check.
 */

import { createServerSupabaseClient } from '@/utils/supabase/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export const CURRENT_TERMS_VERSION = 'v1';

/** True once the user has a stored acceptance row. Checks primary userId and optional altUserId. */
export async function hasAcceptedTerms(userId: string, altUserId?: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return false;

  const { data: data1 } = await supabase
    .from('terms_acceptance')
    .select('terms_version')
    .eq('user_id', userId)
    .maybeSingle();

  if (data1) return true;

  if (altUserId && altUserId !== userId) {
    const { data: data2 } = await supabase
      .from('terms_acceptance')
      .select('terms_version')
      .eq('user_id', altUserId)
      .maybeSingle();

    if (data2) return true;
  }

  return false;
}

/**
 * Record acceptance. Auto-heals foreign key constraint on terms_acceptance if pointing to auth.users.
 */
export async function recordAcceptance(
  userId: string,
  meta?: { ip?: string; userAgent?: string },
  altUserId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return { ok: false, error: 'Supabase client unavailable' };

  const client = supabase;

  async function tryRecord(idToUse: string) {
    const { error: upsertErr } = await client
      .from('terms_acceptance')
      .upsert(
        {
          user_id: idToUse,
          terms_version: CURRENT_TERMS_VERSION,
          ip_address: meta?.ip ?? null,
          user_agent: meta?.userAgent ?? null,
        },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );

    if (!upsertErr) return { ok: true };

    const { error: insertErr } = await client
      .from('terms_acceptance')
      .insert([
        {
          user_id: idToUse,
          terms_version: CURRENT_TERMS_VERSION,
          ip_address: meta?.ip ?? null,
          user_agent: meta?.userAgent ?? null,
        },
      ]);

    if (!insertErr) return { ok: true };
    return { ok: false, error: insertErr.message };
  }

  // 1. Try primary userId
  const res1 = await tryRecord(userId);
  if (res1.ok) return res1;

  // 2. Try altUserId if available
  if (altUserId && altUserId !== userId) {
    const res2 = await tryRecord(altUserId);
    if (res2.ok) return res2;
  }

  // 3. Auto-heal: If foreign key constraint failed on auth.users, drop constraint & retry
  if (res1.error?.includes('terms_acceptance_user_id_fkey')) {
    try {
      console.warn('[consent] Dropping stale terms_acceptance_user_id_fkey constraint...');
      await db.execute(sql`
        ALTER TABLE terms_acceptance DROP CONSTRAINT IF EXISTS terms_acceptance_user_id_fkey;
      `);
      const retryRes = await tryRecord(userId);
      if (retryRes.ok) return retryRes;
    } catch (healErr) {
      console.error('[consent] Auto-heal failed:', healErr);
    }
  }

  return res1;
}
