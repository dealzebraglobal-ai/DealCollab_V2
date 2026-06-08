// src/app/api/matches/[proposalId]/route.ts
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP_N = 3;

interface MatchRow {
    id: string;
    matched_proposal_id: string;
    final_score: string | number;
    similarity_score: string | number;
    match_reason: string;
    match_archetype: string;
    status: string;
    // joined from proposals
    intent: string;
    sectors: string[] | null;
    geographies: string[] | null;
    deal_size_min_cr: string | null;
    deal_size_max_cr: string | null;
    revenue_min_cr: string | null;
    revenue_max_cr: string | null;
    deal_structure: string | null;
    quality_tier: string | null;
    raw_text: string | null;
}

interface ParsedReason {
    reason?: string;
    sectorFit?: string;
    revenueFit?: string;
    strategicFit?: string;
    geographyFit?: string;
    riskFlags?: string[];
}

function parseMatchReason(raw: string): ParsedReason {
    try {
        if (raw.startsWith('{')) return JSON.parse(raw) as ParsedReason;
    } catch { /* fall through */ }
    return { reason: raw };
}

function summarizeDeal(p: MatchRow): string {
    const parts: string[] = [];
    if (p.sectors?.length) parts.push(`${p.sectors[0].toUpperCase()}`);
    if (p.deal_structure) parts.push(p.deal_structure);
    if (p.deal_size_min_cr && p.deal_size_max_cr) {
        parts.push(p.deal_size_min_cr === p.deal_size_max_cr
            ? `₹${p.deal_size_min_cr} Cr`
            : `₹${p.deal_size_min_cr}–${p.deal_size_max_cr} Cr`);
    } else if (p.deal_size_min_cr) {
        parts.push(`₹${p.deal_size_min_cr} Cr`);
    }
    if (p.geographies?.length) parts.push(p.geographies[0]);
    return parts.join(' · ');
}

function snippetFromRawText(text: string | null): string {
    if (!text) return '';
    // strip phone numbers, emails, advisor names — basic redaction
    const redacted = text
        .replace(/\b[6-9]\d{9}\b/g, '[redacted]')
        .replace(/\S+@\S+\.\S+/g, '[redacted]')
        .replace(/\bcontact\s*[:\-]?.*$/gi, '');
    return redacted.slice(0, 280).trim() + (redacted.length > 280 ? '…' : '');
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ proposalID: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { proposalID } = await params;
        if (!proposalID) {
            return NextResponse.json({ error: 'proposalID required' }, { status: 400 });
        }

        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase init failed');

        // Verify ownership
        const { data: userRow } = await supabase
            .from('users')
            .select('id, tokens')
            .eq('email', session.user.email)
            .single();

        if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const { data: proposal } = await supabase
            .from('proposals')
            .select('id, user_id, intent, sectors, geographies, status')
            .eq('id', proposalID)
            .maybeSingle();

        if (!proposal) {
            return NextResponse.json({
                proposalID,
                matchCount: 0,
                isSearching: true,
                matches: [],
                tokensRequired: 50,
                userTokens: userRow.tokens ?? 0,
                message: 'Initializing search...',
            });
        }

        if (proposal.user_id !== userRow.id) {
            return NextResponse.json({ error: 'Not your proposal' }, { status: 403 });
        }

        // Fetch top matches (already scored and ranked by executeMatchmaking)
        const { data: matches, error: matchErr } = await supabase
            .from('proposal_matches')
            .select(`
        id,
        matched_proposal_id,
        final_score,
        similarity_score,
        match_reason,
        match_archetype,
        status
      `)
            .eq('proposal_id', proposalID)
            .neq('status', 'EXPIRED')
            .order('final_score', { ascending: false })
            .limit(TOP_N);

        if (matchErr) {
            console.error('[MATCHES_API] Fetch error:', matchErr);
            return NextResponse.json({ error: matchErr.message }, { status: 500 });
        }

        if (!matches || matches.length === 0) {
            // Check if the engine already queued this for async re-match (meaning it found 0 matches)
            const { data: savedSearch } = await supabase
                .from('saved_searches')
                .select('id')
                .eq('proposal_id', proposalID)
                .maybeSingle();

            return NextResponse.json({
                proposalID,
                matchCount: 0,
                isSearching: !savedSearch,
                matches: [],
                tokensRequired: 50,
                userTokens: userRow.tokens ?? 0,
                message: savedSearch
                    ? 'No immediate matches found. Your mandate is queued — you will be notified when an aligned counterparty joins.'
                    : 'Searching for aligned counterparties...',
            });
        }

        // Hydrate each match with anonymized counterparty info
        const matchedIds = matches.map(m => m.matched_proposal_id);
        const { data: counterparties } = await supabase
            .from('proposals')
            .select(`
        id, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr,
        revenue_min_cr, revenue_max_cr, deal_structure, quality_tier, raw_text
      `)
            .in('id', matchedIds);

        const counterpartyMap = new Map<string, MatchRow>();
        (counterparties || []).forEach(c => counterpartyMap.set(c.id, c as unknown as MatchRow));

        // Check which matches are already connected (so frontend can hide Connect button)
        const { data: existingConnections } = await supabase
            .from('match_connections')
            .select('counterparty_proposal_id, revealed_phone, revealed_advisor_name')
            .eq('initiator_user_id', userRow.id)
            .in('counterparty_proposal_id', matchedIds);

        const connectedSet = new Map<string, { phone: string | null; advisor: string | null }>();
        (existingConnections || []).forEach(c => {
            connectedSet.set(c.counterparty_proposal_id, {
                phone: c.revealed_phone,
                advisor: c.revealed_advisor_name,
            });
        });

        // Build P1/P2/P3
        const enriched = matches.map((m, idx) => {
            const cp = counterpartyMap.get(m.matched_proposal_id);
            const connection = connectedSet.get(m.matched_proposal_id);
            const isConnected = !!connection;
            const parsed = parseMatchReason(m.match_reason);

            return {
                rank: `P${idx + 1}`,
                matchId: m.id,
                proposalId: m.matched_proposal_id,
                finalScore: Number(m.final_score),
                similarityScore: Number(m.similarity_score),
                label: m.match_archetype, // 'VERIFIED_MATCH' | 'HIGH_CONFIDENCE'
                reason: parsed.reason ?? m.match_reason,
                sectorFit: parsed.sectorFit ?? null,
                revenueFit: parsed.revenueFit ?? null,
                strategicFit: parsed.strategicFit ?? null,
                geographyFit: parsed.geographyFit ?? null,
                riskFlags: parsed.riskFlags ?? [],
                // Anonymized public preview
                summary: cp ? summarizeDeal(cp) : 'Counterparty details unavailable',
                intent: cp?.intent ?? null,
                sectors: cp?.sectors ?? [],
                geographies: cp?.geographies ?? [],
                dealStructure: cp?.deal_structure ?? null,
                sizeRange: cp?.deal_size_min_cr && cp?.deal_size_max_cr
                    ? `₹${cp.deal_size_min_cr}–${cp.deal_size_max_cr} Cr`
                    : cp?.deal_size_min_cr ? `₹${cp.deal_size_min_cr} Cr` : null,
                teaser: cp ? snippetFromRawText(cp.raw_text) : '',
                qualityTier: cp?.quality_tier ?? null,
                // Connection state
                isConnected,
                revealedContact: isConnected ? {
                    phone: connection?.phone ?? null,
                    advisor: connection?.advisor ?? null,
                } : null,
            };
        });

        // 🔍 DEBUG: Print fetched matches to terminal
        console.log(`\n[MATCHES_API] ✅ Fetched ${enriched.length} matches for proposal ${proposalID}:`);
        enriched.forEach(m => {
            console.log(`  ${m.rank} | Score: ${m.finalScore} | Intent: ${m.intent} | Sectors: ${m.sectors?.join(', ')} | Size: ${m.sizeRange ?? 'N/A'} | Reason: ${m.reason}`);
        });
        console.log(`[MATCHES_API] ──────────────────────────────────────────\n`);

        return NextResponse.json({
            proposalID,
            matchCount: enriched.length,
            matches: enriched,
            tokensRequired: 50,
            userTokens: userRow.tokens ?? 0,
            canConnect: (userRow.tokens ?? 0) >= 50,
            message: enriched.length > 0
                ? `Found ${enriched.length} aligned counterparties.`
                : 'No matches yet.',
        });
    } catch (err) {
        console.error('[MATCHES_API] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}