// src/lib/matchmakingEngine.ts
/**
 * DealCollab — Matchmaking Engine (M5)
 * Source: DC-MATCH-001 §4–§8
 * Public signature unchanged → route.ts requires no changes to call this.
 */

import { createServerSupabaseClient } from '@/utils/supabase/server';
import OpenAI from 'openai';
import type { DealIntent, SectorKey } from './promptRouter';
import {
  applyAdvisorCap,
  buildExplanation,
  computeCompositeScore,
  getCounterpartyIntents,
  labelFor,
  MIN_SURFACE_SCORE,
  passesHardRules,
  type ScoredMatch,
  type ScoringCandidate,
  type ScoringQuery,
} from './scoringEngine';

export interface ProposalInput {
  mandateId: string;
  userId: string;
  intent: DealIntent;
  raw_text: string;
  sector: SectorKey | null;
  sub_sector: string | null;
  geography: string | null;
  deal_size: string | null;
  revenue: string | null;
  structure: string | null;
  intent_focus: string | null;
  industry_data: Record<string, unknown>;
  special_conditions: string[];
  deal_size_min: string | null;
  deal_size_max: string | null;
  revenue_min: string | null;
  revenue_max: string | null;
  strategic_intent?: string | null;
  geographies?: string[];
}

export interface MatchInsert {
  proposal_id: string;
  matched_proposal_id: string;
  similarity_score: number;
  intent_score: number;
  industry_score: number;
  financial_score: number;
  niche_score: number;
  geography_boost: number;
  final_score: number;
  confidence_score: number;
  match_reason: string;
  match_archetype: string;
  status: string;
}

export interface MatchmakingResult {
  proposalId: string;
  matchCount: number;
  topScore: number;
  matches: MatchInsert[];
  summary: string;
}

function parseNum(s: string | null): number | null {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s));
  return isNaN(n) ? null : n;
}

function buildSemanticNarrative(input: ProposalInput): string {
  const parts = [
    input.intent ? `Intent: ${input.intent}` : '',
    input.sector ? `Sector: ${input.sector}` : '',
    input.sub_sector ? `Sub-sector: ${input.sub_sector}` : '',
    input.geography ? `Geography: ${input.geography}` : '',
    input.structure ? `Structure: ${input.structure}` : '',
    input.deal_size ? `Size: ${input.deal_size}` : '',
    input.revenue ? `Revenue: ${input.revenue}` : '',
    input.intent_focus ? `Focus: ${input.intent_focus}` : '',
    input.raw_text ? input.raw_text.slice(0, 600) : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export async function executeMatchmaking(input: ProposalInput): Promise<MatchmakingResult | null> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    console.error('[M5] Could not create Supabase client');
    return null;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log(`[M5] Starting pipeline for proposal: ${input.mandateId}`);

  try {
    // PHASE 2A: Build narrative + embed
    const narrative = buildSemanticNarrative(input);
    const embedResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: narrative,
      dimensions: 1536,
    });
    const embedding = embedResp.data[0].embedding;
    if (!embedding || embedding.length !== 1536) throw new Error('Invalid embedding');

    // PHASE 2B: Persist embedding via RPC
    const { error: updateErr } = await supabase.rpc('update_proposal_embedding', {
      proposal_id: input.mandateId,
      embedding_vector: embedding,
    });
    if (updateErr) throw new Error(`Embedding persistence failed: ${updateErr.message}`);

    // PHASE 2C: Transition status (new)
    await supabase
      .from('proposals')
      .update({ embedding_status: 'DONE', updated_at: new Date().toISOString() })
      .eq('id', input.mandateId);

    // PHASE 3: Reverse polarity
    const targetIntents = getCounterpartyIntents(input.intent);
    if (targetIntents.length === 0) {
      return { proposalId: input.mandateId, matchCount: 0, topScore: 0, matches: [], summary: 'No counterparty mapping' };
    }

    // PHASE 4: Vector retrieval (min_quality=3)
    const { data: candidates, error: searchErr } = await supabase.rpc('match_proposals', {
      query_embedding: embedding,
      match_intents: targetIntents,
      exclude_user_id: input.userId,
      min_quality: 3,
      result_count: 30,
    });
    if (searchErr) throw new Error(`Vector retrieval failed: ${searchErr.message}`);
    console.log(`[M5] Retrieved ${candidates?.length || 0} candidates`);

    const query: ScoringQuery = {
      intent: input.intent,
      sector: input.sector,
      sub_sector: input.sub_sector,
      geography: input.geography,
      deal_size_min_cr: parseNum(input.deal_size_min),
      deal_size_max_cr: parseNum(input.deal_size_max),
      revenue_min_cr: parseNum(input.revenue_min),
      revenue_max_cr: parseNum(input.revenue_max),
      structure: input.structure,
      special_conditions: input.special_conditions || [],
    };

    // PHASE 5: Hard rules + scoring
    const scored: ScoredMatch[] = [];
    let rejectionCount = 0;
    for (const c of (candidates as ScoringCandidate[]) || []) {
      const hr = passesHardRules(query, c);
      if (!hr.passes) {
        console.log(`[M5] ❌ Candidate ${c.id.slice(0,8)} rejected: ${hr.reason}`);
        rejectionCount++; 
        continue; 
      }
      const score = computeCompositeScore(query, c);
      if (score.final < MIN_SURFACE_SCORE) continue;
      scored.push({
        proposal_id: c.id,
        contact_phone: c.contact_phone,
        advisor_name: c.advisor_name,
        score,
        candidate: c,
      });
    }
    console.log(`[M5] Scored: ${scored.length} | Rejected: ${rejectionCount}`);

    // PHASE 5.5: Advisor cap
    const capped = applyAdvisorCap(scored, 2);
    console.log(`[M5] After advisor cap: ${capped.length}`);

    // PHASE 6: Persist top-10, surface top-3
    const top10 = capped.slice(0, 10);
    const matchInserts: MatchInsert[] = top10.map(m => ({
      proposal_id: input.mandateId,
      matched_proposal_id: m.proposal_id,
      similarity_score: m.score.cosine,
      intent_score: 1.0,
      industry_score: m.score.sector_overlap,
      financial_score: m.score.size_overlap ? 1 : 0,
      niche_score: 0,
      geography_boost: m.score.geo_match === 'exact' ? 0.12 : m.score.geo_match === 'partial' ? 0.06 : 0,
      final_score: m.score.final,
      confidence_score: m.score.bonus,
      match_reason: buildExplanation(query, m.candidate, m.score),
      match_archetype: labelFor(m.score.final),
      status: 'ACTIVE',
    }));

    if (matchInserts.length > 0) {
      const { error: insertErr } = await supabase.from('proposal_matches').insert(matchInserts);
      if (insertErr) console.warn('[M5] proposal_matches insert warning:', insertErr.message);
      console.log(`[M5] Persisted ${matchInserts.length} matches`);
    } else {
      // PHASE 7: Zero matches → save for async re-match
      await supabase.from('saved_searches').insert([{
        user_id: input.userId,
        proposal_id: input.mandateId,
        query_object: query as unknown as Record<string, unknown>,
        embedding,
        status: 'PENDING',
      }]);
      console.log('[M5] Zero matches — saved_searches queued');
    }

    return {
      proposalId: input.mandateId,
      matchCount: matchInserts.length,
      topScore: matchInserts.length > 0 ? matchInserts[0].final_score : 0,
      matches: matchInserts.slice(0, 3),
      summary: matchInserts.length > 0
        ? `Found ${Math.min(matchInserts.length, 3)} aligned counterparties`
        : 'No matches yet — your mandate will be notified when one joins',
    };
  } catch (err) {
    console.error('[M5] Pipeline failed:', err);
    return null;
  }
}