// src/app/api/admin/rematch/[proposalId]/route.ts
// Re-runs executeMatchmaking against a proposal that previously returned 0 matches.

import crypto from 'crypto';
import { auth } from '@/auth';
import { isAdmin as isAdminEmail } from '@/lib/admin';
import { executeMatchmaking } from '@/lib/matchmakingEngine';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidAdminKey(header: string | null): boolean {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || !header) return false;
    const expectedBuf = Buffer.from(expected);
    const headerBuf = Buffer.from(header);
    if (expectedBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, headerBuf);
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ proposalID: string }> }
) {
    try {
        const session = await auth();
        const isAdmin = isValidAdminKey(req.headers.get('x-admin-key')) || isAdminEmail(session?.user?.email);

        if (!isAdmin) {
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
            id: proposalID,
            mandateId: p.mandate_id ?? null,
            userId: p.user_id,
            intent: p.intent,
            raw_text: p.raw_text || '',
            sector: p.sectors?.[0] ?? null,
            industry: p.industry ?? ((p.metadata as Record<string, unknown>)?.industry as string) ?? null,
            sub_sector: null,
            serving_sectors: p.serving_sectors ?? [],
            geography: p.geographies?.[0] ?? null,
            geographies: p.geographies ?? [],
            deal_size: null,
            revenue: null,
            structure: p.deal_structure,
            deal_structure: p.deal_structure,
            buyer_type: p.buyer_type ?? ((p.metadata as Record<string, unknown>)?.buyer_type as string) ?? null,
            intent_focus: null,
            industry_data: (p.metadata as Record<string, unknown>) ?? {},
            special_conditions: p.special_conditions || [],
            deal_size_min: p.deal_size_min_cr?.toString() ?? null,
            deal_size_max: p.deal_size_max_cr?.toString() ?? null,
            deal_size_min_cr: p.deal_size_min_cr,
            deal_size_max_cr: p.deal_size_max_cr,
            revenue_min: p.revenue_min_cr?.toString() ?? null,
            revenue_max: p.revenue_max_cr?.toString() ?? null,
            revenue_min_cr: p.revenue_min_cr,
            revenue_max_cr: p.revenue_max_cr,
            inferred_buyer_type: p.inferred_buyer_type || null,
            currency: p.currency || null,
            urgency: p.urgency || null,
            intent_validated: p.intent_validated ?? false,
            document_url: p.document_url ?? null,
            document_text: p.document_text ?? null,
            source: p.source || 'WEB',
        });

        return NextResponse.json({ proposalID, result });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}
