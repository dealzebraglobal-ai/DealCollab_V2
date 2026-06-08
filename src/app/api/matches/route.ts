/**
 * DealCollab — /api/matches
 * ==========================
 * Place at: src/app/api/matches/route.ts
 *
 * GET: Returns anonymous match cards for the current user's proposals.
 * Called by frontend after is_complete=true in chat response.
 *
 * Privacy rules:
 *   ✘ Never exposes: user_id, company name, contact, raw_text, mandate_id
 *   ✔ Exposes only: sector, geography, size range, score label, match reason
 *
 * Query params:
 *   ?min_score=40    minimum final_score to include (default 40)
 *   ?limit=10        max results to return (default 10)
 */

import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

// ─── Helpers ──────────────────────────────────────────────────

function getScoreLabel(score: number): 'High' | 'Good' | 'Possible' {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Good';
  return 'Possible';
}

function formatSizeRange(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `₹${min}–${max} Cr`;
  if (max) return `₹${max} Cr`;
  if (min) return `₹${min}+ Cr`;
  return null;
}

// ─── Main handler ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase client init failed');

    // Resolve userId (consistent with route.ts pattern)
    let userId = session.user.id;
    const { data: dbUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (!dbUser) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', session.user.email)
        .single();
      if (byEmail) userId = byEmail.id;
    }

    // Parse query params
    const url = new URL(req.url);
    const minScore = parseInt(url.searchParams.get('min_score') ?? '40', 10);
    const maxResults = parseInt(url.searchParams.get('limit') ?? '10', 10);

    // ── Try RPC first (preferred — single query) ──────────────
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_matches_for_user', {
      p_user_id: userId,
      min_score: minScore,
      max_results: maxResults,
    });

    if (!rpcErr && rpcData && rpcData.length > 0) {
      const cards = (rpcData as Array<Record<string, unknown>>).map(m => ({
        matchId: m.match_id,
        finalScore: m.final_score,
        scoreLabel: getScoreLabel(m.final_score as number),
        matchReason: (m.match_reason as string) ?? 'Sector and size alignment identified.',
        matchArchetype: (m.match_archetype as string) ?? 'Cross-sector capability',
        matchedSector: ((m.matched_sectors as string[] | null)?.[0]) ?? null,
        matchedGeography: ((m.matched_geographies as string[] | null)?.[0]) ?? null,
        matchedSizeRange: formatSizeRange(
          m.matched_size_min as number | null,
          m.matched_size_max as number | null,
        ),
        matchedIntent: (m.matched_intent as string | null) ?? null,
        qualityTier: (m.matched_quality_tier as number) ?? 2,
        createdAt: m.created_at,
      }));

      return NextResponse.json({ success: true, matches: cards, total: cards.length });
    }

    if (!rpcErr && rpcData && rpcData.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        total: 0,
        message: 'No matches yet. Your mandate runs continuously for 90 days.',
      });
    }

    // ── Fallback: direct join query if RPC not yet deployed ───
    console.warn('[MATCHES API] RPC unavailable, using fallback query:', rpcErr?.message);

    const { data: userProposals } = await supabase
      .from('proposals')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    if (!userProposals || userProposals.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        total: 0,
        message: 'No proposals found. Submit a mandate to start matching.',
      });
    }

    const pIds = userProposals.map((p: { id: string }) => p.id);

    const { data: matches, error: matchErr } = await supabase
      .from('proposal_matches')
      .select('id, proposal_id, matched_proposal_id, final_score, match_reason, match_archetype, created_at')
      .in('proposal_id', pIds)
      .gte('final_score', minScore)
      .eq('status', 'ACTIVE')
      .order('final_score', { ascending: false })
      .limit(maxResults);

    if (matchErr) throw new Error(matchErr.message);

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        total: 0,
        message: 'No matches yet. Your mandate runs continuously for 90 days.',
      });
    }

    // Fetch matched proposal details (anonymous fields only)
    const matchedIds = matches.map((m: { matched_proposal_id: string }) => m.matched_proposal_id);
    const { data: matchedProposals } = await supabase
      .from('proposals')
      .select('id, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, quality_tier')
      .in('id', matchedIds);

    const proposalMap = new Map(
      (matchedProposals ?? []).map((p: Record<string, unknown>) => [p.id as string, p])
    );

    const cards = (matches as Array<Record<string, unknown>>).map(m => {
      const mp = proposalMap.get(m.matched_proposal_id as string);
      return {
        matchId: m.id,
        finalScore: m.final_score,
        scoreLabel: getScoreLabel(m.final_score as number),
        matchReason: (m.match_reason as string) ?? 'Sector and size alignment identified.',
        matchArchetype: (m.match_archetype as string) ?? 'Cross-sector capability',
        matchedSector: ((mp?.sectors as string[] | null)?.[0]) ?? null,
        matchedGeography: ((mp?.geographies as string[] | null)?.[0]) ?? null,
        matchedSizeRange: formatSizeRange(
          (mp?.deal_size_min_cr as number | null) ?? null,
          (mp?.deal_size_max_cr as number | null) ?? null,
        ),
        matchedIntent: (mp?.intent as string | null) ?? null,
        qualityTier: (mp?.quality_tier as number) ?? 2,
        createdAt: m.created_at,
      };
    });

    return NextResponse.json({ success: true, matches: cards, total: cards.length });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MATCHES API] Error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}