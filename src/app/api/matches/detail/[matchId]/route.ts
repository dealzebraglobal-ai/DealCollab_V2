// src/app/api/matches/detail/[matchId]/route.ts
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { buildBlindCounterparty, type CounterpartyProposalRow } from '@/lib/M5_blindCard';
import { buildSynergyReview, type SynergySide } from '@/lib/M5_synergy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { matchId } = await params;
    if (!matchId) {
      return NextResponse.json({ error: 'matchId required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase client failed to initialize');

    const { data: dbUser } = await supabase
      .from('users')
      .select('id, tokens')
      .eq('email', session.user.email)
      .single();

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch the match
    const { data: match, error: matchErr } = await supabase
      .from('proposal_matches')
      .select('id, proposal_id, matched_proposal_id, final_score, match_reason, match_archetype, status')
      .eq('id', matchId)
      .single();

    if (matchErr || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Authz: the requesting user must own the SOURCE proposal of this match row.
    // (Works for the reciprocal direction too: a notification's match_id has proposal_id = the
    // recipient's own proposal, so the older user passes this check for their blind alert.)
    const { data: userProposal } = await supabase
      .from('proposals')
      .select('id, user_id, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, revenue_min_cr, revenue_max_cr, metadata')
      .eq('id', match.proposal_id)
      .single();

    if (!userProposal || userProposal.user_id !== dbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch the counterparty proposal. We SELECT identity columns here, but they only ever
    // reach the client when isConnected — buildBlindCounterparty decides what crosses the wire.
    const { data: counterpartyProposal } = await supabase
      .from('proposals')
      .select(`
        id, user_id, intent, sectors, geographies,
        deal_size_min_cr, deal_size_max_cr, revenue_min_cr, revenue_max_cr,
        deal_structure, special_conditions, quality_tier, normalised_text,
        summary_text, raw_text, metadata, contact_phone, advisor_name
      `)
      .eq('id', match.matched_proposal_id)
      .single();

    if (!counterpartyProposal) {
      return NextResponse.json({ error: 'Counterparty proposal not found' }, { status: 404 });
    }

    // Connection state gates ALL identity-bearing data.
    const { data: existingEoi } = await supabase
      .from('eois')
      .select('id, status, sender_id, receiver_id')
      .eq('match_id', matchId)
      .maybeSingle();

    const isConnected = existingEoi?.status === 'approved';

    // Single source of truth for what the client may see (pure, harness-tested).
    const counterparty = buildBlindCounterparty(
      counterpartyProposal as CounterpartyProposalRow,
      isConnected,
    );

    // Deterministic, identity-safe synergy summary (sector/geo/bands/industry only; band, not score).
    const numOf = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const industryOf = (m: unknown): string | null =>
      m && typeof (m as Record<string, unknown>).industry === 'string'
        ? ((m as Record<string, unknown>).industry as string)
        : null;
    const toSide = (p: Record<string, unknown>): SynergySide => ({
      intent: String(p.intent ?? ''),
      sector: (p.sectors as string[] | null)?.[0] ?? null,
      industry: industryOf(p.metadata),
      geography: (p.geographies as string[] | null)?.[0] ?? null,
      dealMin: numOf(p.deal_size_min_cr),
      dealMax: numOf(p.deal_size_max_cr),
      revMin: numOf(p.revenue_min_cr),
      revMax: numOf(p.revenue_max_cr),
    });
    const synergy = buildSynergyReview(
      toSide(userProposal as Record<string, unknown>),
      toSide(counterpartyProposal as Record<string, unknown>),
      Number(match.final_score),
    );

    return NextResponse.json({
      success: true,
      match: {
        id: match.id,
        proposalId: match.proposal_id,
        matchedProposalId: match.matched_proposal_id,
        finalScore: Number(match.final_score),
        matchReason: match.match_reason || '',
        matchArchetype: match.match_archetype,
        status: match.status,
      },
      counterparty,
      synergy,
      eoi: existingEoi ? {
        id: existingEoi.id,
        status: existingEoi.status,
        isSender: existingEoi.sender_id === dbUser.id,
      } : null,
      userTokens: dbUser.tokens ?? 0,
    });
  } catch (error: unknown) {
    console.error('🔥 GET /api/matches/detail/[matchId] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}