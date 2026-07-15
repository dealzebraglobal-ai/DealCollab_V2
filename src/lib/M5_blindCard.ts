/**
 * DealCollab — M5: Blind Counterparty Card
 * =========================================
 * Place at: src/lib/M5_blindCard.ts
 *
 * PURE. Decides EXACTLY what crosses the wire about a counterparty proposal, and when.
 * The blind guarantee is enforced HERE, server-side — never in the frontend.
 *
 * Rule: before an EOI is approved (isConnected=false), the payload contains ONLY
 * non-identifying, structured fields + a teaser built solely from those fields.
 * Identity-bearing data (contact_phone, advisor_name, raw_text, normalised_text,
 * summary_text, metadata, special_conditions) is withheld until isConnected=true.
 *
 * Why each is withheld pre-EOI (from real data):
 *   raw_text         — often names the company ("Second-generation promoters of <Brand>…")
 *   normalised_text  — canonical text; low risk but not guaranteed clean
 *   summary_text     — anonymized for engine rows, NOT guaranteed for imported rows
 *   metadata         — imported rows carry contact_email / source_file / URL
 *   special_conditions — carries JSON.stringify(industry_data), arbitrary contents
 *   contact_phone / advisor_name — direct PII
 */

export interface CounterpartyProposalRow {
    id: string;
    user_id: string | null;
    intent: string;
    sectors: string[] | null;
    geographies: string[] | null;
    deal_size_min_cr: number | string | null;
    deal_size_max_cr: number | string | null;
    revenue_min_cr: number | string | null;
    revenue_max_cr: number | string | null;
    deal_structure: string | null;
    quality_tier: number | string | null;
    // identity-bearing — surfaced ONLY when connected:
    raw_text?: string | null;
    normalised_text?: string | null;
    summary_text?: string | null;
    special_conditions?: string[] | null;
    contact_phone?: string | null;
    advisor_name?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface MatchRowLite {
    id: string;
    proposal_id: string;
    matched_proposal_id: string;
    final_score: number | string;
    match_reason: string | null;
    match_archetype: string | null;
    status: string | null;
}

const INTENT_LABEL: Record<string, string> = {
    SELL_SIDE: 'Sell-side divestment',
    BUY_SIDE: 'Buy-side acquisition',
    FUNDRAISING: 'Equity fundraising',
    DEBT: 'Debt financing',
    STRATEGIC_PARTNERSHIP: 'Strategic partnership',
};

function num(v: number | string | null | undefined): number | null {
    if (v == null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function band(min: number | null, max: number | null): string | null {
    if (!min && !max) return null;
    if (min && max && min !== max) return `₹${min}–${max} Cr`;
    return `₹${max ?? min} Cr`;
}

/**
 * Teaser built ONLY from structured, non-identifying fields. No free text of any kind.
 * This is the only summary shown pre-EOI.
 */
export function buildSafeTeaser(cp: CounterpartyProposalRow): string {
    const parts: string[] = [];
    const label = INTENT_LABEL[cp.intent] || cp.intent || 'Opportunity';
    const sectors = (cp.sectors || []).join(', ');
    const geos = (cp.geographies || []).join(', ');

    let headline = label;
    if (sectors) headline += ` — ${sectors}`;
    if (geos) headline += ` (${geos})`;
    parts.push(headline);

    if (cp.deal_structure) parts.push(`Structure: ${cp.deal_structure}`);
    const size = band(num(cp.deal_size_min_cr), num(cp.deal_size_max_cr));
    if (size) parts.push(`Deal size: ${size}`);
    const rev = band(num(cp.revenue_min_cr), num(cp.revenue_max_cr));
    if (rev) parts.push(`Revenue: ${rev}`);

    // NOTE: deliberately NO fallback to normalised_text / raw_text. If structured data is
    // sparse, the teaser is just the headline — never free text that could name the party.
    return parts.join('. ') + '.';
}

export interface BlindCounterpartyView {
    id: string;
    userId: string | null;     // bare uuid; needed by the EOI-send flow. Not PII on its own.
    intent: string;
    sectors: string[];
    geographies: string[];
    dealSizeMinCr: number | string | null;
    dealSizeMaxCr: number | string | null;
    revenueMinCr: number | string | null;
    revenueMaxCr: number | string | null;
    dealStructure: string | null;
    qualityTier: number | string | null;
    industry: string | null;    // free-text industry (owner-ruled safe pre-EOI); extracted ONLY from metadata.industry
    teaser: string;
    anonymizedPreview: string;
    isConnected: boolean;
    // present ONLY when connected:
    revealedContact: { phone: string | null; advisor: string | null } | null;
    specialConditions: string[];
}

/**
 * The single source of truth for what the client may see about a counterparty.
 * isConnected=false -> structured + teaser only. isConnected=true -> + contact + full summary.
 */
export function buildBlindCounterparty(
    cp: CounterpartyProposalRow,
    isConnected: boolean,
): BlindCounterpartyView {
    const teaser = buildSafeTeaser(cp);

    // Extract ONLY the free-text industry from metadata. Nothing else from metadata crosses the
    // wire pre-EOI — imported rows carry contact_email/URL there.
    const rawIndustry = cp.metadata && typeof cp.metadata.industry === 'string' ? cp.metadata.industry.trim() : '';
    const industry = rawIndustry.length > 0 ? rawIndustry : null;

    const view: BlindCounterpartyView = {
        id: cp.id,
        userId: cp.user_id,
        intent: cp.intent,
        sectors: cp.sectors || [],
        geographies: cp.geographies || [],
        dealSizeMinCr: cp.deal_size_min_cr,
        dealSizeMaxCr: cp.deal_size_max_cr,
        revenueMinCr: cp.revenue_min_cr,
        revenueMaxCr: cp.revenue_max_cr,
        dealStructure: cp.deal_structure,
        qualityTier: cp.quality_tier,
        industry,
        teaser,
        anonymizedPreview: teaser,     // pre-EOI: teaser only
        isConnected,
        revealedContact: null,
        specialConditions: [],
    };

    if (!isConnected) return view;

    // Connected: now (and only now) surface identity-bearing data.
    return {
        ...view,
        anonymizedPreview: (cp.summary_text?.trim() || cp.raw_text?.trim() || teaser),
        revealedContact: { phone: cp.contact_phone ?? null, advisor: cp.advisor_name ?? null },
        specialConditions: cp.special_conditions || [],
    };
}