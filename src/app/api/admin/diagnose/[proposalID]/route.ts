// src/app/api/admin/diagnose/[proposalId]/route.ts
// Returns a complete forensic breakdown of why matching succeeded/failed for a proposal.
// Surface this in your admin UI or hit directly with curl.

import { auth } from '@/auth';
import type { DealIntent } from '@/lib/promptRouter';
import { getCounterpartyIntents } from '@/lib/scoringEngine';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ proposalID: string }> }
) {
    try {
        const adminKey = req.headers.get('x-admin-key');
        const session = await auth();
        const isAdmin = !!process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY;

        if (!isAdmin && !session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { proposalID } = await params;
        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase init failed');

        // 1. Fetch the source proposal
        const { data: proposal } = await supabase
            .from('proposals')
            .select('*')
            .eq('id', proposalID)
            .single();

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        // 2. Determine target intents
        const targetIntents = getCounterpartyIntents(proposal.intent as DealIntent);

        // 3. Funnel: count candidates at each filter stage
        const { count: stage1_total } = await supabase
            .from('proposals')
            .select('*', { count: 'exact', head: true })
            .neq('user_id', proposal.user_id);

        const { count: stage2_intent } = await supabase
            .from('proposals')
            .select('*', { count: 'exact', head: true })
            .neq('user_id', proposal.user_id)
            .in('intent', targetIntents);

        const { count: stage3_active } = await supabase
            .from('proposals')
            .select('*', { count: 'exact', head: true })
            .neq('user_id', proposal.user_id)
            .in('intent', targetIntents)
            .eq('status', 'ACTIVE');

        const { count: stage4_embedded } = await supabase
            .from('proposals')
            .select('*', { count: 'exact', head: true })
            .neq('user_id', proposal.user_id)
            .in('intent', targetIntents)
            .eq('status', 'ACTIVE')
            .eq('embedding_status', 'DONE')
            .not('embedding', 'is', null);

        const { count: stage5_quality } = await supabase
            .from('proposals')
            .select('*', { count: 'exact', head: true })
            .neq('user_id', proposal.user_id)
            .in('intent', targetIntents)
            .eq('status', 'ACTIVE')
            .eq('embedding_status', 'DONE')
            .not('embedding', 'is', null)
            .in('quality_tier', ['1', '2', '3']);

        // 4. Show a sample of candidates at each stage
        const { data: sampleCandidates } = await supabase
            .from('proposals')
            .select('id, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, quality_tier, embedding_status, status')
            .neq('user_id', proposal.user_id)
            .in('intent', targetIntents)
            .limit(10);

        // 5. Existing matches for this proposal (if any)
        const { data: existingMatches } = await supabase
            .from('proposal_matches')
            .select('matched_proposal_id, final_score, match_archetype, match_reason, status')
            .eq('proposal_id', proposalID)
            .order('final_score', { ascending: false })
            .limit(10);

        // 6. Identify the blocker
        let primaryBlocker = 'unknown';
        if ((stage1_total || 0) === 0) primaryBlocker = 'NO_OTHER_USERS — proposals table contains only your data';
        else if ((stage2_intent || 0) === 0) primaryBlocker = `NO_COUNTERPARTY_INTENT — no rows with intent in [${targetIntents.join(', ')}]`;
        else if ((stage3_active || 0) === 0) primaryBlocker = 'NO_ACTIVE_STATUS — counterparties exist but none have status=ACTIVE';
        else if ((stage4_embedded || 0) === 0) primaryBlocker = 'NO_EMBEDDINGS — run seed-embeddings.ts to embed candidates';
        else if ((stage5_quality || 0) === 0) primaryBlocker = 'ALL_TIER_4 — candidates exist but all are stubs (tier 4)';
        else primaryBlocker = `CANDIDATES_EXIST_BUT_NO_MATCHES_PERSISTED — ${stage5_quality} viable candidates, but no proposal_matches rows. Re-run executeMatchmaking.`;

        return NextResponse.json({
            proposal: {
                id: proposal.id,
                intent: proposal.intent,
                sectors: proposal.sectors,
                geographies: proposal.geographies,
                quality_tier: proposal.quality_tier,
                embedding_status: proposal.embedding_status,
                status: proposal.status,
                deal_size_min_cr: proposal.deal_size_min_cr,
                deal_size_max_cr: proposal.deal_size_max_cr,
            },
            target_counterparty_intents: targetIntents,
            candidate_funnel: {
                stage1_other_users_total: stage1_total,
                stage2_with_target_intent: stage2_intent,
                stage3_status_active: stage3_active,
                stage4_embedded_and_active: stage4_embedded,
                stage5_quality_tier_1_2_3: stage5_quality,
            },
            primary_blocker: primaryBlocker,
            sample_candidates: sampleCandidates,
            existing_matches: existingMatches || [],
            next_action_hint: primaryBlocker.startsWith('NO_OTHER_USERS')
                ? 'Run scripts/repair-database.ts to migrate mandates → proposals, then scripts/seed-embeddings.ts'
                : primaryBlocker.startsWith('NO_EMBEDDINGS')
                    ? 'Run: npx tsx scripts/seed-embeddings.ts'
                    : primaryBlocker.startsWith('CANDIDATES_EXIST_BUT_NO_MATCHES_PERSISTED')
                        ? 'Re-trigger matchmaking via POST /api/admin/rematch/' + proposalID
                        : 'Inspect the sample_candidates list and verify sector/size compatibility.',
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}