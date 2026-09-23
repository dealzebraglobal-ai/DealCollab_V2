// src/app/api/cron/rematch/route.ts
// Async re-match worker: checks active/pending saved_searches against proposals table.
// Uses the EXACT unified scoring and hard rules from matchmakingEngine.ts and M5_sectorMatrix.ts.

import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { notifyMatchViaWhatsApp } from '@/lib/whatsappNotify';
import {
    applyHardRejections,
    calculateV2Score,
    type ProposalInput,
    type Candidate,
} from '@/lib/matchmakingEngine';

const NOTIFICATION_THRESHOLD = 60; // Standard 60-point floor across engine
const MAX_PER_RUN = 100;

const COUNTERPARTY_INTENTS: Record<string, string[]> = {
    BUY_SIDE: ['SELL_SIDE', 'FUNDRAISING'],
    SELL_SIDE: ['BUY_SIDE'],
    FUNDRAISING: ['BUY_SIDE', 'INVESTOR'],
    DEBT: ['DEBT', 'BUY_SIDE'],
    STRATEGIC_PARTNERSHIP: ['STRATEGIC_PARTNERSHIP', 'BUY_SIDE', 'SELL_SIDE'],
};

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
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Mark expired
    await supabase
        .from('saved_searches')
        .update({ status: 'EXPIRED' })
        .in('status', ['PENDING', 'ACTIVE'])
        .lt('expires_at', new Date().toISOString());

    // Fetch active/pending searches
    const { data: pending } = await supabase
        .from('saved_searches')
        .select('*')
        .in('status', ['PENDING', 'ACTIVE'])
        .order('last_match_run_at', { ascending: true, nullsFirst: true })
        .limit(MAX_PER_RUN);

    if (!pending || pending.length === 0) {
        return NextResponse.json({ checked: 0, notified: 0 });
    }

    let notified = 0;

    for (const ss of pending) {
        const query = (ss.query_object || {}) as Record<string, unknown>;
        const intent = (ss.intent || query.intent) as string;
        if (!intent) continue;

        // Reconstruct ProposalInput from saved search
        const sourceProposal: ProposalInput = {
            mandateId: ss.proposal_id || crypto.randomUUID(),
            userId: ss.user_id,
            intent,
            raw_text: (query.raw_text as string) || '',
            sector: (ss.sectors?.[0] || query.sector || null) as string | null,
            industry: (ss.industry || query.industry || null) as string | null,
            sub_sector: (query.sub_sector || null) as string | null,
            serving_sectors: Array.isArray(query.serving_sectors) ? query.serving_sectors as string[] : [],
            geography: (ss.geographies?.[0] || query.geography || null) as string | null,
            deal_size: (query.deal_size as string) || null,
            revenue: (query.revenue as string) || null,
            structure: (query.structure as string) || null,
            buyer_type: (query.buyer_type as string) || null,
            intent_focus: (query.intent_focus as string) || null,
            industry_data: (query.industry_data as Record<string, unknown>) || {},
            special_conditions: Array.isArray(query.special_conditions) ? query.special_conditions as string[] : [],
            deal_size_min: query.deal_size_min ? String(query.deal_size_min) : null,
            deal_size_max: query.deal_size_max ? String(query.deal_size_max) : null,
            revenue_min: query.revenue_min ? String(query.revenue_min) : null,
            revenue_max: query.revenue_max ? String(query.revenue_max) : null,
        };

        // Reuse saved query embedding, or compute if missing
        let embedding: number[] = ss.query_embedding;
        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            const narrative = [
                `Intent: ${sourceProposal.intent}`,
                sourceProposal.industry ? `Industry: ${sourceProposal.industry}` : '',
                sourceProposal.sector ? `Sector: ${sourceProposal.sector}` : '',
                sourceProposal.geography ? `Geography: ${sourceProposal.geography}` : '',
                sourceProposal.structure ? `Structure: ${sourceProposal.structure}` : '',
            ].filter(Boolean).join('\n');

            const embedResp = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: narrative,
                dimensions: 1536,
            });
            embedding = embedResp.data[0].embedding;
        }

        const targets = COUNTERPARTY_INTENTS[intent] || [intent];

        const { data: candidates, error: rpcErr } = await supabase.rpc('match_proposals', {
            query_embedding: embedding,
            match_intents: targets,
            exclude_user_id: ss.user_id,
            min_quality: 3,
            result_count: 20,
        });

        if (rpcErr || !candidates) continue;

        let bestScore = 0;
        let bestCandidate: Candidate | null = null;
        const validMatches: Array<{ proposal_id: string; matched_proposal_id: string; final_score: number; match_reason: string; match_archetype: string }> = [];

        for (const c of (candidates as Candidate[])) {
            const hardCheck = applyHardRejections(sourceProposal, c);
            if (hardCheck.rejected) continue;

            const scored = calculateV2Score(sourceProposal, c);
            if (scored.finalScore >= (ss.min_score || NOTIFICATION_THRESHOLD)) {
                validMatches.push({
                    proposal_id: ss.proposal_id,
                    matched_proposal_id: c.id,
                    final_score: scored.finalScore,
                    match_reason: scored.matchReason,
                    match_archetype: scored.archetype,
                });

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
        await supabase
            .from('saved_searches')
            .update({
                last_match_run_at: new Date().toISOString(),
                match_count: validMatches.length,
                match_attempt_count: (ss.match_attempt_count || 0) + 1,
            })
            .eq('proposal_id', ss.proposal_id);

        if (bestScore >= (ss.min_score || NOTIFICATION_THRESHOLD) && bestCandidate && ss.user_id) {
            await supabase.from('notifications').insert([{
                user_id: ss.user_id,
                type: 'MATCH_FOUND',
                message: `A new ${bestScore >= 80 ? 'verified' : 'high-confidence'} match was found for your mandate.`,
                is_read: false,
            }]);

            void notifyMatchViaWhatsApp({
                userId: ss.user_id,
                companySummary: `${bestCandidate.sectors?.[0] || 'General'} • ${bestCandidate.geographies?.[0] || 'Global'}`,
                matchScorePercent: bestScore,
            });

            notified++;
        }
    }

    return NextResponse.json({ checked: pending.length, notified });
}