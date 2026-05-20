import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch user's proposals
    const { data: userProposals, error: proposalsErr } = await supabase
      .from('proposals')
      .select(`
        id,
        intent,
        sectors,
        geographies,
        deal_size_min_cr,
        deal_size_max_cr,
        status,
        created_at,
        raw_text
      `)
      .eq('user_id', dbUser.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false });

    if (proposalsErr) throw proposalsErr;

    if (!userProposals || userProposals.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch matches for these proposals
    const proposalIds = userProposals.map((p) => p.id);
    
    // We do a join with matched_proposal_id to get the counterparty data
    const { data: matchesData, error: matchesErr } = await supabase
      .from('proposal_matches')
      .select(`
        id,
        proposal_id,
        similarity_score,
        final_score,
        match_reason,
        matched_proposal_id,
        matched_proposal:proposals!matched_proposal_id (
          id,
          intent,
          sectors,
          geographies,
          deal_size_min_cr,
          deal_size_max_cr,
          deal_structure,
          raw_text
        )
      `)
      .in('proposal_id', proposalIds)
      .order('final_score', { ascending: false });

    if (matchesErr) throw matchesErr;

    // Hydrate the proposals with their matches
    const hydratedDeals = userProposals.map((proposal) => {
      const proposalMatches = (matchesData || []).filter((m) => m.proposal_id === proposal.id).map(m => {
        const cp = Array.isArray(m.matched_proposal) ? m.matched_proposal[0] : m.matched_proposal;
        return {
          id: m.id,
          score: m.final_score,
          similarity: m.similarity_score,
          reason: m.match_reason,
          matchedProposalId: m.matched_proposal_id,
          counterparty: cp ? {
            intent: cp.intent,
            sectors: cp.sectors,
            geographies: cp.geographies,
            size_min: cp.deal_size_min_cr,
            size_max: cp.deal_size_max_cr,
            raw_text: cp.raw_text
          } : null
        };
      });

      return {
        ...proposal,
        matches: proposalMatches
      };
    });

    return NextResponse.json(hydratedDeals);
  } catch (error: any) {
    console.error("🔥 GET /api/deals ERROR:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
