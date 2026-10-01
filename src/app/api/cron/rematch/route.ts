// src/app/api/cron/rematch/route.ts
// Async re-match worker: checks active/pending saved_searches against proposals table.
// Uses the EXACT unified scoring and hard rules from matchmakingEngine.ts and M5_sectorMatrix.ts.

import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { notifyMatchViaWhatsApp } from '@/lib/whatsappNotify';
import { deliverNotificationEmail, type NotificationRow } from '@/lib/email/notifications/delivery';
import {
  applyHardRejections,
  calculateV2Score,
  buildCanonicalText,
  embed,
  COUNTERPARTY_INTENTS,
  REVERSE_INTENT,
  type ProposalInput,
  type Candidate,
} from '@/lib/matchmakingEngine';

const NOTIFICATION_THRESHOLD = 60; // Standard 60-point floor across engine
const MAX_PER_RUN = 100;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/rematch] CRON_SECRET is not configured — rejecting all requests.');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: 'no_supabase' }, { status: 500 });

  // Mark expired
  await supabase
    .from('saved_searches')
    .update({ status: 'EXPIRED' })
    .in('status', ['PENDING', 'ACTIVE'])
    .lt('expires_at', new Date().toISOString());

  // Fetch active/pending searches
  const { data: pending, error: fetchErr } = await supabase
    .from('saved_searches')
    .select('*')
    .in('status', ['PENDING', 'ACTIVE'])
    .order('last_match_run_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);

  if (fetchErr) {
    console.error('[cron/rematch] Error fetching pending searches:', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  let notified = 0;

  for (const ss of pending) {
    const rawQuery = (ss.query_object || {}) as Record<string, unknown>;
    const intent = (ss.intent || rawQuery.intent) as string;
    if (!intent) continue;

    const sourceProposal: ProposalInput = {
      mandateId: ss.proposal_id || null,
      userId: (ss.user_id || rawQuery.userId) as string,
      intent,
      raw_text: (rawQuery.raw_text as string) || '',
      sector: (ss.sectors?.[0] || rawQuery.sector || null) as string | null,
      industry: (ss.industry || rawQuery.industry || null) as string | null,
      sub_sector: (rawQuery.sub_sector || null) as string | null,
      serving_sectors: Array.isArray(rawQuery.serving_sectors)
        ? (rawQuery.serving_sectors as string[])
        : (rawQuery.serving_sectors ? [rawQuery.serving_sectors as string] : []),
      geography: (ss.geographies?.[0] || rawQuery.geography || null) as string | null,
      geographies: ss.geographies || (rawQuery.geographies as string[]) || [],
      deal_size: (rawQuery.deal_size as string) || null,
      revenue: (rawQuery.revenue as string) || null,
      structure: (rawQuery.structure as string) || (rawQuery.deal_structure as string) || null,
      deal_structure: (rawQuery.structure as string) || (rawQuery.deal_structure as string) || null,
      buyer_type: (rawQuery.buyer_type as string) || null,
      inferred_buyer_type: (rawQuery.inferred_buyer_type as string) || null,
      currency: (rawQuery.currency as string) || null,
      urgency: (rawQuery.urgency as string) || null,
      intent_focus: (rawQuery.intent_focus as string) || null,
      industry_data: (rawQuery.industry_data as Record<string, unknown>) || {},
      special_conditions: Array.isArray(rawQuery.special_conditions) ? rawQuery.special_conditions as string[] : [],
      deal_size_min: rawQuery.deal_size_min != null ? String(rawQuery.deal_size_min) : (rawQuery.deal_size_min_cr != null ? String(rawQuery.deal_size_min_cr) : null),
      deal_size_max: rawQuery.deal_size_max != null ? String(rawQuery.deal_size_max) : (rawQuery.deal_size_max_cr != null ? String(rawQuery.deal_size_max_cr) : null),
      revenue_min: rawQuery.revenue_min != null ? String(rawQuery.revenue_min) : (rawQuery.revenue_min_cr != null ? String(rawQuery.revenue_min_cr) : null),
      revenue_max: rawQuery.revenue_max != null ? String(rawQuery.revenue_max) : (rawQuery.revenue_max_cr != null ? String(rawQuery.revenue_max_cr) : null),
    };

    // Step 4: scheduled rematch should reuse saved query embedding if present,
    // otherwise generate a rich reversed query embedding rather than a weak string.
    let searchEmbedding = ss.query_embedding as number[] | null;
    if (!searchEmbedding || !Array.isArray(searchEmbedding) || searchEmbedding.length === 0) {
      const reversedIntent = REVERSE_INTENT[sourceProposal.intent] ?? sourceProposal.intent;
      const fullQueryText = buildCanonicalText(sourceProposal, reversedIntent);
      searchEmbedding = await embed(fullQueryText);
    }

    const targets = COUNTERPARTY_INTENTS[intent] || [intent];

    const { data: candidates, error: rpcErr } = await supabase.rpc('match_proposals', {
      query_embedding: searchEmbedding,
      match_intents: targets,
      exclude_user_id: ss.user_id,
      min_quality: 3,
      result_count: 20,
    });

    if (rpcErr || !candidates) {
      console.warn(`[cron/rematch] match_proposals RPC error for search ${ss.search_id || ss.proposal_id}:`, rpcErr?.message);
      continue;
    }

    let bestScore = 0;
    let bestCandidate: Candidate | null = null;
    const validMatches: Array<{
      proposal_id: string;
      matched_proposal_id: string;
      final_score: number;
      match_reason: string;
      match_archetype: string;
    }> = [];

    for (const c of (candidates as Candidate[])) {
      const hardCheck = applyHardRejections(sourceProposal, c);
      if (hardCheck.rejected) continue;

      const scored = calculateV2Score(sourceProposal, c);
      const minThreshold = ss.min_score || NOTIFICATION_THRESHOLD;
      if (scored.finalScore >= minThreshold) {
        if (ss.proposal_id) {
          validMatches.push({
            proposal_id: ss.proposal_id,
            matched_proposal_id: c.id,
            final_score: scored.finalScore,
            match_reason: scored.matchReason,
            match_archetype: scored.archetype,
          });
        }

        if (scored.finalScore > bestScore) {
          bestScore = scored.finalScore;
          bestCandidate = c;
        }
      }
    }

    // Upsert any newly found matches
    if (validMatches.length > 0 && ss.proposal_id) {
      await supabase.from('proposal_matches').upsert(
        validMatches.map(m => ({
          ...m,
          similarity_score: 0,
          industry_score: 0,
          financial_score: 0,
          geography_boost: 0,
          confidence_score: 0,
          status: 'ACTIVE',
        })),
        { onConflict: 'proposal_id,matched_proposal_id', ignoreDuplicates: true }
      );
    }

    // Update search run timestamp & match count
    const updatePayload: Record<string, unknown> = {
      last_match_run_at: new Date().toISOString(),
      match_count: (ss.match_count || 0) + validMatches.length,
      match_attempt_count: (ss.match_attempt_count || 0) + 1,
    };

    if (ss.search_id) {
      await supabase.from('saved_searches').update(updatePayload).eq('search_id', ss.search_id);
    } else if (ss.proposal_id) {
      await supabase.from('saved_searches').update(updatePayload).eq('proposal_id', ss.proposal_id);
    }

    if (bestScore >= (ss.min_score || NOTIFICATION_THRESHOLD) && bestCandidate && ss.user_id) {
      const indLabel = bestCandidate.industry || bestCandidate.sectors?.[0] || 'Target Industry';
      const geoLabel = bestCandidate.geographies?.[0] || 'Target Region';

      const { data: notification } = await supabase.from('notifications').insert([{
        user_id: ss.user_id,
        type: 'MATCH_FOUND',
        message: `A new ${bestScore >= 80 ? 'verified' : 'high-confidence'} match was found for your mandate in ${indLabel} (${geoLabel}).`,
        is_read: false,
      }]).select().single();

      if (notification) {
        void deliverNotificationEmail(supabase, notification as NotificationRow).catch((err) => {
          console.error('[cron/rematch] Failed to deliver match email:', err);
        });
      }

      void notifyMatchViaWhatsApp({
        userId: ss.user_id,
        companySummary: `${indLabel} • ${geoLabel}`,
        matchScorePercent: bestScore,
      });

      notified++;
    }
  }

  return NextResponse.json({ checked: pending.length, notified });
}