// src/app/api/admin/rematch/[proposalId]/route.ts
// Re-runs executeMatchmaking against a proposal that previously returned 0 matches.

import { auth } from '@/auth';
import { executeMatchmaking } from '@/lib/matchmakingEngine';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';



export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ proposalID: string }> }
) {
    try {
        const adminKey = req.headers.get('x-admin-key');
        const session = await auth();
        const isAdmin = process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY;

        if (!isAdmin && !session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { proposalID } = await params;
        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase init failed');

        const { data: p } = await supabase.from('proposals').select('*').eq('id', proposalID).single();
        if (!p) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

        // Clear old matches for clean slate
        await supabase.from('proposal_matches').delete().eq('proposal_id', proposalID);

        const result = await executeMatchmaking({
            mandateId: p.id,
            userId: p.user_id,
            intent: p.intent,
            raw_text: p.raw_text || '',
            sector: p.sectors?.[0] ?? null,
            sub_sector: null,
            geography: p.geographies?.[0] ?? null,
            deal_size: null,
            revenue: null,
            structure: p.deal_structure,
            intent_focus: null,
            industry_data: {},
            special_conditions: p.special_conditions || [],
            deal_size_min: p.deal_size_min_cr?.toString() ?? null,
            deal_size_max: p.deal_size_max_cr?.toString() ?? null,
            revenue_min: p.revenue_min_cr?.toString() ?? null,
            revenue_max: p.revenue_max_cr?.toString() ?? null,
        });

        return NextResponse.json({ proposalID, result });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}