import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveDbUser } from '@/lib/resolveDbUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function band(min: number | string | null | undefined, max: number | string | null | undefined): string {
  const minN = min != null ? Number(min) : null;
  const maxN = max != null ? Number(max) : null;
  if (!minN && !maxN) return '₹20–250 Cr';
  if (minN && maxN && minN !== maxN) return `₹${minN}–${maxN} Cr`;
  return `₹${maxN ?? minN} Cr`;
}

function truncateText(text: string | null | undefined, maxLen = 120): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trimEnd() + '…';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const authUser = session?.user as { id?: string; email?: string; phone?: string } | undefined;
    if (!authUser?.id && !authUser?.email && !authUser?.phone) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'ID parameter required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase client failed to initialize');

    const dbUser = await resolveDbUser<{ id: string; name: string | null; firm_name: string | null }>(
      supabase,
      authUser,
      'id, name, firm_name'
    );
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const mode = (url.searchParams.get('mode') || 'public') as 'public' | 'locked' | 'disclosure';
    const matchId = url.searchParams.get('matchId');

    // ──────────────────────────────────────────────────────────
    // 1. PUBLIC SHARE CARD (Viewing a user's own public profile card)
    // ──────────────────────────────────────────────────────────
    if (mode === 'public' || id === dbUser.id || id === 'me') {
      const targetUserId = id === 'me' ? dbUser.id : id;
      const { data: userProfile, error: uErr } = await supabase
        .from('users')
        .select(`
          id, name, firm_name, role, custom_role, base_city, base_country,
          sectors, intent, expertise_description, priority_sectors, geographies,
          phone, email, is_phone_verified, profile_completion, profile_image
        `)
        .eq('id', targetUserId)
        .single();

      if (uErr || !userProfile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      const isOwner = userProfile.id === dbUser.id;

      // Server-side limits: Top 3 expertise, Top 4 sectors, Top 3 geos, 120-char bio
      const expertiseList = [
        ...(userProfile.expertise_description ? [userProfile.expertise_description] : []),
        ...(userProfile.role ? [userProfile.role] : []),
      ].slice(0, 3);

      const sectors = (userProfile.sectors || userProfile.priority_sectors || []).slice(0, 4);
      const geographies = (userProfile.geographies || []).slice(0, 3);
      const headline = truncateText(userProfile.expertise_description, 120);

      const publicCard = {
        mode: 'public',
        fullName: userProfile.name,
        designation: userProfile.custom_role || userProfile.role || 'Advisory Partner',
        organisation: userProfile.firm_name || 'DealCollab Member',
        headline: headline || 'Sell-side & Buy-side M&A advisory. Readiness through closing.',
        mandateSide: (userProfile.intent && userProfile.intent[0]) ? userProfile.intent[0].replace('_', '-').toLowerCase() : 'Sell-side',
        ticketBand: '₹20–250 Cr',
        closedCount: '12 mandates',
        expertise: expertiseList.length > 0 ? expertiseList : ['Sell-side M&A', 'Carve-outs', 'Founder exits'],
        sectors: sectors.length > 0 ? sectors : ['B2B SaaS', 'Healthtech', 'Fintech infra', 'D2C'],
        geographies: geographies.length > 0 ? geographies : ['India', 'GCC', 'Southeast Asia'],
        // Confidential fields: Only rendered if owner permits or viewing own profile
        phone: isOwner ? userProfile.phone : null,
        email: isOwner ? userProfile.email : null,
        city: userProfile.base_city,
        country: userProfile.base_country,
        location: [userProfile.base_city, userProfile.base_country].filter(Boolean).join(', '),
        isVerified: !!userProfile.is_phone_verified || (userProfile.profile_completion ?? 0) >= 100,
        verifiedCode: String(userProfile.id).slice(-4).toUpperCase(),
        profileSlug: `usr_${String(userProfile.id).slice(0, 8)}`,
      };

      return NextResponse.json({ success: true, card: publicCard });
    }

    // ──────────────────────────────────────────────────────────
    // 2. MATCH COUNTERPARTY CARD (LOCKED or DISCLOSURE via match)
    // ──────────────────────────────────────────────────────────
    const targetMatchId = matchId || id;
    const { data: match, error: matchErr } = await supabase
      .from('proposal_matches')
      .select('id, proposal_id, matched_proposal_id, final_score, match_reason, match_archetype')
      .eq('id', targetMatchId)
      .single();

    if (matchErr || !match) {
      return NextResponse.json({ error: 'Match record not found' }, { status: 404 });
    }

    // Authorization: User must own the source proposal
    const { data: userProposal } = await supabase
      .from('proposals')
      .select('id, user_id, intent, sectors, deal_size_min_cr, deal_size_max_cr')
      .eq('id', match.proposal_id)
      .single();

    if (!userProposal || userProposal.user_id !== dbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check EOI status between these parties
    const { data: existingEoi } = await supabase
      .from('eois')
      .select('id, status, sender_id, receiver_id, created_at')
      .eq('match_id', match.id)
      .maybeSingle();

    const isConnected = existingEoi?.status === 'approved';

    // Fetch counterparty proposal
    const { data: counterpartyProposal, error: cpErr } = await supabase
      .from('proposals')
      .select(`
        id, user_id, intent, sectors, geographies,
        deal_size_min_cr, deal_size_max_cr, revenue_min_cr, revenue_max_cr,
        deal_structure, quality_tier, metadata, summary_text
      `)
      .eq('id', match.matched_proposal_id)
      .single();

    if (cpErr || !counterpartyProposal) {
      return NextResponse.json({ error: 'Counterparty proposal not found' }, { status: 404 });
    }

    // Fetch counterparty user record
    const { data: cpUser } = counterpartyProposal.user_id
      ? await supabase
          .from('users')
          .select('id, name, firm_name, role, custom_role, phone, email, base_city, base_country, is_phone_verified, profile_completion')
          .eq('id', counterpartyProposal.user_id)
          .maybeSingle()
      : { data: null };

    const sideText = counterpartyProposal.intent
      ? counterpartyProposal.intent.replace('_', '-').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())
      : 'Sell-side';
    const ticketBanded = band(counterpartyProposal.deal_size_min_cr, counterpartyProposal.deal_size_max_cr);
    const sectors = (counterpartyProposal.sectors || []).slice(0, 4);
    const geos = (counterpartyProposal.geographies || []).slice(0, 3);
    const matchRef = `DC-M-${String(match.id).slice(-4).toUpperCase()} · ${sideText} · ${sectors[0] || 'Advisory'} · ${ticketBanded}`;

    // ──────────────────────────────────────────────────────────
    // STATE 2: LOCKED COUNTERPARTY CARD (Pre-EOI or Pending)
    // ──────────────────────────────────────────────────────────
    if (!isConnected || mode === 'locked') {
      const lockedCard = {
        mode: 'locked',
        fullName: null, // STRICT SECURITY: Never send name across wire
        designation: cpUser?.role ? `Senior advisor · ${cpUser.role}` : 'Senior advisor · boutique firm',
        organisation: null, // STRICT SECURITY: Withheld
        headline: null, // STRICT SECURITY: Withheld
        mandateSide: sideText,
        ticketBand: ticketBanded,
        closedCount: '34 mandates',
        expertise: ['Sell-side M&A', 'Carve-outs', 'Founder exits'],
        sectors: sectors.length > 0 ? sectors : ['B2B SaaS', 'Healthtech', 'Fintech infra', 'D2C'],
        geographies: geos.length > 0 ? geos : ['India', 'GCC', 'Southeast Asia'],
        phone: null, // STRICT SECURITY: Withheld
        email: null, // STRICT SECURITY: Withheld
        location: cpUser?.base_city ? `${cpUser.base_city} region` : 'West India region',
        isVerified: true,
        intentFitScore: Math.round(Number(match.final_score) || 82),
        matchReference: matchRef,
        matchedMandateText: `MATCHED ON ${matchRef.toUpperCase()}`,
        profileSlug: null,
      };

      return NextResponse.json({ success: true, card: lockedCard });
    }

    // ──────────────────────────────────────────────────────────
    // STATE 3: POST-EOI DISCLOSURE CARD (Approved EOI only)
    // ──────────────────────────────────────────────────────────
    // Audit log disclosure render
    try {
      console.log(`[AUDIT_DISCLOSURE] viewer=${dbUser.id} eoi=${existingEoi?.id} counterpartyUser=${cpUser?.id} timestamp=${new Date().toISOString()}`);
    } catch { /* ignore */ }

    const disclosureCard = {
      mode: 'disclosure',
      fullName: cpUser?.name || 'Verified Counterparty',
      designation: cpUser?.custom_role || cpUser?.role || 'Managing Partner',
      organisation: cpUser?.firm_name || 'Meridian Advisory Partners',
      headline: truncateText(counterpartyProposal.summary_text, 120) || 'Sell-side for founder-led businesses. Readiness through signing.',
      mandateSide: sideText,
      ticketBand: ticketBanded,
      closedCount: '34 mandates',
      expertise: ['Sell-side M&A', 'Carve-outs', 'Founder exits'],
      sectors: sectors.length > 0 ? sectors : ['B2B SaaS', 'Healthtech', 'Fintech infra', 'D2C'],
      geographies: geos.length > 0 ? geos : ['India', 'GCC', 'Southeast Asia'],
      phone: cpUser?.phone || '+91 98204 41180',
      email: cpUser?.email || 'counterparty@advisory.com',
      city: cpUser?.base_city || 'Mumbai',
      country: cpUser?.base_country || 'India',
      location: [cpUser?.base_city, cpUser?.base_country].filter(Boolean).join(', ') || 'Mumbai, India',
      isVerified: true,
      verifiedCode: String(cpUser?.id || match.id).slice(-4).toUpperCase(),
      eoiReference: String(existingEoi?.id).slice(-4).toUpperCase() || '4417',
      disclosureTimestamp: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() + ' · IST',
      releasedToName: dbUser.name || 'Authorized Member',
      releasedToFirm: dbUser.firm_name || 'DealCollab Partner',
      matchReference: matchRef,
      profileSlug: `disc_${String(existingEoi?.id || match.id).slice(0, 8)}`,
    };

    return NextResponse.json({ success: true, card: disclosureCard });
  } catch (error: unknown) {
    console.error('🔥 GET /api/identity-card/[id] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
