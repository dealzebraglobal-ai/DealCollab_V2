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
        // Previously this only checked "is any session present", not whether that
        // session belongs to an admin — any logged-in user could trigger rematch
        // for any proposal. Now requires the ADMIN_EMAILS allowlist (same source
        // of truth as /api/admin/dashboard) OR the internal admin key.
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