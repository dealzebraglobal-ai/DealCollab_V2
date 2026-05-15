/**
 * DealCollab — Match Persistence
 * =============================
 * Rule 13: Permanent matches table logic.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface MatchInsert {
  proposal_id_a: string;
  proposal_id_b: string;
  cosine_score: number;
  keyword_score: number;
  bonus_score: number;
  final_score: number;
  match_label: string;
  match_explanation: Record<string, unknown>; // JSONB
  status: string;
}

export async function persistMatches(supabase: SupabaseClient, matches: MatchInsert[]) {
  if (matches.length === 0) return;

  console.log(`[MATCH_INSERT] Persisting ${matches.length} matches...`);
  
  const { error } = await supabase
    .from('matches')
    .upsert(matches, { onConflict: 'proposal_id_a, proposal_id_b' });

  if (error) {
    console.error('[MATCH_INSERT ERROR]', error);
    throw error;
  }
}

export async function saveSearch(supabase: SupabaseClient, userId: string, proposalId: string, params: Record<string, unknown>) {
  const { error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: userId,
      proposal_id: proposalId,
      query_params: params
    });

  if (error) console.error('[SAVED_SEARCH ERROR]', error);
}
