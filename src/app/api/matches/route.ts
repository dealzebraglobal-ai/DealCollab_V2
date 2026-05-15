/**
 * DealCollab — /api/matches
 * ==========================
 * Place at: src/app/api/matches/route.ts
 *
 * GET: Returns anonymous match cards for the current user.
 * Called by frontend after is_complete=true in chat response.
 *
 * Privacy: never exposes name, company, contact, or identity.
 * Exposes only: sector, geography, size range, score, reason.
 */

import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

function scoreLabel(score: number): 'High' | 'Good' | 'Possible' {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Good';
  return 'Possible';
}

function formatSize(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `₹${min}–${max} Cr`;
  return `₹${max || min} Cr`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    // Resolve userId (consistent with route.ts)
    let userId = session.user.id;
    const { data: dbUser } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!dbUser) {
      const { data: byEmail } = await supabase.from('users').select('id').eq('email', session.user.email).single();
      if (byEmail) userId = byEmail.id;
    }

    const url = new URL(req.url);
    const minScore = parseInt(url.searchParams.get('min_score') ?? '40', 10);
    const maxResults = parseInt(url.searchParams.get('limit') ?? '10', 10);

    // Try RPC first
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_matches_for_user', {
      p_user_id: userId,
      min_score: minScore,
      max_results: maxResults,
    });

    if (!rpcErr && rpcData) {
      const cards = rpcData.map((m: Record<string, unknown>) => ({
        matchId: m.match_id,
        finalScore: m.final_score,
        scoreLabel: scoreLabel(m.final_score as number),
        matchReason: m.match_reason ?? 'Sector and size alignment identified.',
        matchArchetype: m.match_archetype ?? 'Cross-sector capability',
        matchedSector: (m.matched_sectors as string[] | null)?.[0] ?? null,
        matchedGeography: (m.matched_geographies as string[] | null)?.[0] ?? null,
        matchedSizeRange: formatSize(m.matched_size_min as number | null, m.matched_size_max as number | null),
        matchedIntent: m.matched_intent ?? null,
        qualityTier: m.matched_quality_tier ?? 2,
        createdAt: m.created_at,
      }));

      return NextResponse.json({ success: true, matches: cards, total: cards.length });
    }

    // Fallback: direct join query if RPC not yet deployed
    const { data: userProposals } = await supabase
      .from('proposals')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    if (!userProposals?.length) {
      return NextResponse.json({
        success: true, matches: [], total: 0,
        message: 'No proposals found. Submit a mandate to start matching.',
      });
    }

    const pIds = userProposals.map((p: { id: string }) => p.id);

    const { data: matches } = await supabase
      .from('proposal_matches')
      .select('id, proposal_id, matched_proposal_id, final_score, match_reason, match_archetype, created_at')
      .in('proposal_id', pIds)
      .gte('final_score', minScore)
      .eq('status', 'ACTIVE')
      .order('final_score', { ascending: false })
      .limit(maxResults);

    if (!matches?.length) {
      return NextResponse.json({
        success: true, matches: [], total: 0,
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
      (matchedProposals ?? []).map((p: Record<string, unknown>) => [p.id, p])
    );

    const cards = (matches as Array<Record<string, unknown>>).map(m => {
      const mp = proposalMap.get(m.matched_proposal_id as string) as Record<string, unknown> | undefined;
      return {
        matchId: m.id,
        finalScore: m.final_score,
        scoreLabel: scoreLabel(m.final_score as number),
        matchReason: m.match_reason ?? 'Sector and size alignment identified.',
        matchArchetype: m.match_archetype ?? 'Cross-sector capability',
        matchedSector: (mp?.sectors as string[] | null)?.[0] ?? null,
        matchedGeography: (mp?.geographies as string[] | null)?.[0] ?? null,
        matchedSizeRange: formatSize(mp?.deal_size_min_cr as number | null, mp?.deal_size_max_cr as number | null),
        matchedIntent: mp?.intent ?? null,
        qualityTier: mp?.quality_tier ?? 2,
        createdAt: m.created_at,
      };
    });

    return NextResponse.json({ success: true, matches: cards, total: cards.length });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[MATCHES API]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}