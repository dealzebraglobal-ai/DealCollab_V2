// src/app/api/deals/[proposalID]/search-matches/route.ts
/**
 * "Search For Matches" button — Bulk Uploaded Mandates only.
 *
 * Re-runs the EXISTING matchmaking engine (executeMatchmaking) against an
 * already-created bulk proposal. Reconstructs ProposalInput from the stored
 * row (same approach as /api/admin/rematch), then passes the SAME proposal id
 * so matchmakingEngine's upsert updates that row in place instead of spawning
 * a duplicate proposal.
 */

import { auth } from '@/auth';
import { executeMatchmaking } from '@/lib/matchmakingEngine';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proposalID: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { proposalID } = await params;
    const { data: p, error: propErr } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalID)
      .single();

    if (propErr || !p) return NextResponse.json({ error: 'Mandate not found' }, { status: 404 });
    if (p.user_id !== dbUser.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (p.source !== 'BULK') return NextResponse.json({ error: 'Not a bulk-uploaded mandate' }, { status: 400 });

    // Clear old matches for a clean re-search
    await supabase.from('proposal_matches').delete().eq('proposal_id', proposalID);

    const result = await executeMatchmaking({
      id: proposalID,
      mandateId: p.mandate_id ?? crypto.randomUUID(),
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
      industry_data: (p.metadata as Record<string, unknown>) ?? {},
      special_conditions: p.special_conditions || [],
      deal_size_min: p.deal_size_min_cr?.toString() ?? null,
      deal_size_max: p.deal_size_max_cr?.toString() ?? null,
      revenue_min: p.revenue_min_cr?.toString() ?? null,
      revenue_max: p.revenue_max_cr?.toString() ?? null,
      document_url: p.document_url ?? null,
      document_text: p.document_text ?? null,
      source: 'BULK',
    });

    return NextResponse.json({ success: true, proposalID, result });
  } catch (err) {
    console.error('🔥 POST /api/deals/[proposalID]/search-matches ERROR:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
