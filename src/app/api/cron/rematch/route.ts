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

const NOTIFICATION_THRESHOLD = 0.70;
const MAX_PER_RUN = 100;

export async function GET(req: NextRequest) {
    // Vercel cron auth
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
                message: `A new ${labelFor(bestScore)} match was found for your mandate.`,
                is_read: 'false',
            }]);

            notified++;
        }
    }

    return NextResponse.json({ checked: pending.length, notified });
}