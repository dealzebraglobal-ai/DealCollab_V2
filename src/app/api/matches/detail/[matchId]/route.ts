import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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

    // Get current user id
    const { data: dbUser } = await supabase
      .from('users')
      .select('id, tokens')
      .eq('email', session.user.email)
      .single();

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch the match from proposal_matches
    const { data: match, error: matchErr } = await supabase
      .from('proposal_matches')
      .select(`
        id,
        proposal_id,
        matched_proposal_id,
        final_score,
        match_reason,
        match_archetype,
        status
      `)
      .eq('id', matchId)
      .single();

    if (matchErr || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Verify user owns the source proposal
    const { data: userProposal } = await supabase
      .from('proposals')
      .select('id, user_id, intent, sectors, geographies')
      .eq('id', match.proposal_id)
      .single();

    if (!userProposal || userProposal.user_id !== dbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: counterpartyProposal } = await supabase
      .from('proposals')
      .select(`
        id, user_id, intent, sectors, geographies,
        deal_size_min_cr, deal_size_max_cr, revenue_min_cr, revenue_max_cr,
        deal_structure, special_conditions, quality_tier, normalised_text,
        metadata, contact_phone, advisor_name
      `)
      .eq('id', match.matched_proposal_id)
      .single();

    if (!counterpartyProposal) {
      return NextResponse.json({ error: 'Counterparty proposal not found' }, { status: 404 });
    }

    // Check if an EOI already exists for this match
    const { data: existingEoi } = await supabase
      .from('eois')
      .select('id, status, sender_id, receiver_id')
      .eq('match_id', matchId)
      .maybeSingle();

    const isConnected = existingEoi?.status === 'approved';

    // Build the anonymized preview from the counterparty's STRUCTURED PROPOSAL FIELDS.
    // These are the actual extracted deal intelligence columns — NOT chat messages.
    // Previous attempts used mandates.extraction.message which is an AI acknowledgment
    // ("Your requirement has been structured successfully."), not the deal data.
    const buildTeaser = (): string => {
      const intentLabel: Record<string, string> = {
        SELL_SIDE: 'Sell-side divestment',
        BUY_SIDE: 'Buy-side acquisition',
        FUNDRAISING: 'Equity fundraising',
        DEBT: 'Debt financing',
        STRATEGIC_PARTNERSHIP: 'Strategic partnership',
      };

      const parts: string[] = [];

      const label = intentLabel[counterpartyProposal.intent] || counterpartyProposal.intent;
      const sectors = (counterpartyProposal.sectors || []).join(', ');
      const geos = (counterpartyProposal.geographies || []).join(', ');

      let headline = label;
      if (sectors) headline += ` — ${sectors}`;
      if (geos) headline += ` (${geos})`;
      parts.push(headline);

      if (counterpartyProposal.deal_structure) {
        parts.push(`Structure: ${counterpartyProposal.deal_structure}`);
      }

      const sMin = counterpartyProposal.deal_size_min_cr ? Number(counterpartyProposal.deal_size_min_cr) : null;
      const sMax = counterpartyProposal.deal_size_max_cr ? Number(counterpartyProposal.deal_size_max_cr) : null;
      if (sMin || sMax) {
        const sizeStr = sMin && sMax && sMin !== sMax ? `₹${sMin}–${sMax} Cr` : `₹${sMax ?? sMin} Cr`;
        parts.push(`Deal size: ${sizeStr}`);
      }

      const rMin = counterpartyProposal.revenue_min_cr ? Number(counterpartyProposal.revenue_min_cr) : null;
      const rMax = counterpartyProposal.revenue_max_cr ? Number(counterpartyProposal.revenue_max_cr) : null;
      if (rMin || rMax) {
        const revStr = rMin && rMax && rMin !== rMax ? `₹${rMin}–${rMax} Cr` : `₹${rMax ?? rMin} Cr`;
        parts.push(`Revenue: ${revStr}`);
      }

      // Use canonical normalised_text as a last-resort enrichment if structured fields are sparse
      if (parts.length <= 1 && counterpartyProposal.normalised_text) {
        return counterpartyProposal.normalised_text.trim();
      }

      return parts.join('. ') + '.';
    };

    const matchExplanation = match.match_reason || '';

    // Priority chain for anonymized deal summary (never use matchReason — different purpose):
    // 1. metadata.mandate_summary — rich paragraph generated by buildMandateSummary() at proposal creation
    // 2. normalised_text — canonical cleaned deal description
    // 3. buildTeaser() — runtime template from structured fields (last resort)
    const cpMeta = (counterpartyProposal.metadata ?? {}) as Record<string, unknown>;
    const mandateSummary = typeof cpMeta.mandate_summary === 'string' && cpMeta.mandate_summary.trim()
      ? cpMeta.mandate_summary.trim()
      : null;
    const templateTeaser = buildTeaser();

    let anonymizedPreview: string;
    let previewSource: string;
    if (mandateSummary) {
      anonymizedPreview = mandateSummary;
      previewSource = 'mandate_summary';
    } else if (counterpartyProposal.normalised_text?.trim()) {
      anonymizedPreview = counterpartyProposal.normalised_text.trim();
      previewSource = 'normalised_text';
    } else {
      anonymizedPreview = templateTeaser;
      previewSource = 'template_teaser';
    }

    console.log('[MatchDetails] matchExplanation:', matchExplanation);
    console.log('[MatchDetails] anonymizedPreview:', anonymizedPreview);
    console.log('[MatchDetails] previewSource:', previewSource);

    return NextResponse.json({
      success: true,
      match: {
        id: match.id,
        proposalId: match.proposal_id,
        matchedProposalId: match.matched_proposal_id,
        finalScore: Number(match.final_score),
        matchReason: matchExplanation,
        matchArchetype: match.match_archetype,
        status: match.status,
      },
      counterparty: {
        id: counterpartyProposal.id,
        userId: counterpartyProposal.user_id,
        intent: counterpartyProposal.intent,
        sectors: counterpartyProposal.sectors || [],
        geographies: counterpartyProposal.geographies || [],
        dealSizeMinCr: counterpartyProposal.deal_size_min_cr,
        dealSizeMaxCr: counterpartyProposal.deal_size_max_cr,
        revenueMinCr: counterpartyProposal.revenue_min_cr,
        revenueMaxCr: counterpartyProposal.revenue_max_cr,
        dealStructure: counterpartyProposal.deal_structure,
        specialConditions: counterpartyProposal.special_conditions || [],
        qualityTier: counterpartyProposal.quality_tier,
        teaser: templateTeaser,
        anonymizedPreview,
        previewSource,
        revealedContact: isConnected ? {
          phone: counterpartyProposal.contact_phone,
          advisor: counterpartyProposal.advisor_name,
        } : null,
      },
      eoi: existingEoi ? {
        id: existingEoi.id,
        status: existingEoi.status,
        isSender: existingEoi.sender_id === dbUser.id,
      } : null,
      userTokens: dbUser.tokens ?? 0,
    });
  } catch (error: any) {
    console.error('🔥 GET /api/matches/detail/[matchId] ERROR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
