// src/app/api/cron/rematch/route.ts
// Async re-match worker: every PENDING saved_search is checked against new proposals.
// Trigger via Vercel Cron — see vercel.json below.

import {
    computeCompositeScore,
    labelFor,
    passesHardRules,
    type ScoringCandidate,
    type ScoringQuery,
} from '@/lib/scoringEngine';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { notifyMatchViaWhatsApp } from '@/lib/whatsappNotify';

const NOTIFICATION_THRESHOLD = 0.70;
const MAX_PER_RUN = 100;

export async function GET(req: NextRequest) {
    // Vercel cron auth. SECURITY: previously `if (process.env.CRON_SECRET && ...)`
    // meant an UNSET CRON_SECRET short-circuited the whole check to false —
    // silently allowing any unauthenticated caller through. This endpoint
    // triggers real OpenAI API calls and WhatsApp notifications, so a missing
    // secret must fail closed (reject everyone), never fail open.
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
        .eq('status', 'PENDING')
        .lt('expires_at', new Date().toISOString());

    // Fetch pending
    const { data: pending } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('status', 'PENDING')
        .limit(MAX_PER_RUN);

    if (!pending || pending.length === 0) {
        return NextResponse.json({ checked: 0, notified: 0 });
    }

    let notified = 0;

    for (const ss of pending) {
        const query = ss.query_object as ScoringQuery;
        if (!query?.intent) continue;

        // Re-embed (we don't store embedding column in saved_searches in schema above)
        const narrative = [
            `Intent: ${query.intent}`,
            query.sector ? `Sector: ${query.sector}` : '',
            query.geography ? `Geography: ${query.geography}` : '',
        ].filter(Boolean).join('\n');

        const embedResp = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: narrative,
            dimensions: 1536,
        });
        const embedding = embedResp.data[0].embedding;

        const { INTENT_FLIP } = await import('@/lib/scoringEngine');
        const targets = INTENT_FLIP[query.intent as keyof typeof INTENT_FLIP] || [];

        const { data: candidates } = await supabase.rpc('match_proposals', {
            query_embedding: embedding,
            match_intents: targets,
            exclude_user_id: ss.user_id,
            min_quality: 3,
            result_count: 10,
        });

        let bestScore = 0;
        let bestCandidate: ScoringCandidate | null = null;

        for (const c of (candidates as ScoringCandidate[]) || []) {
            if (!passesHardRules(query, c).passes) continue;
            const s = computeCompositeScore(query, c);
            if (s.final > bestScore) {
                bestScore = s.final;
                bestCandidate = c;
            }
        }

        if (bestScore >= NOTIFICATION_THRESHOLD && bestCandidate) {
            // Mark notified
            await supabase
                .from('saved_searches')
                .update({ status: 'NOTIFIED', notified_at: new Date().toISOString() })
                .eq('search_id', ss.search_id);

            // Insert notification
            await supabase.from('notifications').insert([{
                user_id: ss.user_id,
                type: 'MATCH_FOUND',
                message: `A new ${labelFor(bestScore) === 'VERIFIED_MATCH' ? 'verified' : 'high-confidence'} match was found for your mandate.`,
                is_read: 'false',
            }]);

            if (ss.user_id) {
                void notifyMatchViaWhatsApp({
                    userId: ss.user_id,
                    companySummary: `${bestCandidate.sectors?.[0] || 'General'} • ${bestCandidate.geographies?.[0] || 'Global'}`,
                    matchScorePercent: bestScore * 100,
                });
            }

            notified++;
        }
    }

    return NextResponse.json({ checked: pending.length, notified });
}