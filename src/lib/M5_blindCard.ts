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

/**
 * Pre-EOI "Strategic Rationale" — a proper 3-6 sentence paragraph, built from EXACTLY the same
 * safe inputs as buildSafeTeaser() (never raw_text/normalised_text/summary_text/metadata beyond
 * the SAFE_INDUSTRY_DATA_KEYS allowlist), just composed as readable prose instead of terse
 * "Label: value" fragments. Confidentiality guarantee is identical to buildSafeTeaser — this is
 * strictly a presentation change, not a new data-exposure surface.
 */
export function buildSafeStrategicRationale(
    cp: CounterpartyProposalRow,
    industry: string | null,
    businessData: BusinessDataField[],
): string {
    const label = (INTENT_LABEL[cp.intent] || cp.intent || 'Opportunity').toLowerCase();
    const sectorText = industry || (cp.sectors || [])[0]?.toLowerCase().replace(/_/g, ' ') || null;
    const geos = (cp.geographies || []).filter(Boolean);
    const sizeBand = band(num(cp.deal_size_min_cr), num(cp.deal_size_max_cr));
    const revBand = band(num(cp.revenue_min_cr), num(cp.revenue_max_cr));

    const sentences: string[] = [];

    // Opener: what this mandate is.
    const geoPhrase = geos.length > 0
        ? geos.length === 1 ? ` based in or targeting ${geos[0]}` : ` across ${geos.slice(0, 3).join(', ')}`
        : '';
    sentences.push(
        `This mandate is a ${label}${sectorText ? ` in the ${sectorText} space` : ''}${geoPhrase}.`
    );

    // Financials, when available.
    if (sizeBand || revBand) {
        const parts: string[] = [];
        if (sizeBand) parts.push(`a deal size of ${sizeBand}`);
        if (revBand) parts.push(`annual revenue in the ${revBand} range`);
        sentences.push(`The transaction involves ${parts.join(' and ')}.`);
    }

    // Structure.
    if (cp.deal_structure) {
        sentences.push(`The preferred transaction structure is ${cp.deal_structure}.`);
    }

    // Business characteristics — top 3, in readable form (not "Label: value" fragments).
    if (businessData.length > 0) {
        const attrs = businessData.slice(0, 3).map(f => `${f.label.toLowerCase()} of ${f.value}`);
        sentences.push(`Notable business characteristics include ${attrs.join(', ')}.`);
    }

    // Closer, only if we have genuinely little else to say (keeps the paragraph from reading as
    // a bare fact-list when the underlying proposal has very few structured fields filled in).
    if (sentences.length <= 2) {
        sentences.push('Full operational details are shared with the counterparty once an Expression of Interest is approved.');
    }

    return sentences.join(' ');
}

// Explicit allowlist of industry_data / metadata keys that are safe to surface
// BEFORE an EOI is approved — every one of these is a structured business
// attribute (capacity, certifications, business model, etc.), never free text
// that could name the company. Canonical keys per M0_outputSchema.ts's
// "industry_data: Populate from user's M4 answers using CANONICAL KEYS" list,
// plus the contract-manufacturing business-model flag (stateManager.ts).
// Everything else in metadata (raw_text fragments, document_url, contact
// fields on imported rows, mandate_summary, custom_title/remark) stays withheld.
const SAFE_INDUSTRY_DATA_KEYS = [
    'sub_type', 'regulatory_approvals', 'product_portfolio', 'manufacturing_capacity',
    'certifications', 'capacity_utilisation', 'client_concentration', 'revenue_model',
    'client_profile', 'churn_or_retention', 'core_value', 'regulatory_status',
    'loan_book_or_aum', 'asset_type', 'operational_status', 'capacity_mw',
    'ppa_off_taker', 'channel_mix', 'brand_strength', 'sku_portfolio',
    'infrastructure_type', 'contract_quality', 'geography_coverage', 'accreditations',
    'enrolment_scale', 'founder_dependency', 'product_type', 'export_revenue_pct',
    'compliance_status', 'asset_ownership', 'performance_history', 'location_spread',
    'regulatory_licences', 'debt_structure', 'business_model', 'capabilities',
    'government_oem_exposure', 'technology_rd_focus',
] as const;

const FIELD_LABELS: Record<string, string> = {
    sub_type: 'Sub-type', regulatory_approvals: 'Regulatory Approvals', product_portfolio: 'Product Portfolio',
    manufacturing_capacity: 'Manufacturing Capacity', certifications: 'Certifications',
    capacity_utilisation: 'Capacity Utilisation', client_concentration: 'Client Concentration',
    revenue_model: 'Revenue Model', client_profile: 'Client Profile', churn_or_retention: 'Churn / Retention',
    core_value: 'Core Value Driver', regulatory_status: 'Regulatory Status', loan_book_or_aum: 'Loan Book / AUM',
    asset_type: 'Asset Type', operational_status: 'Operational Status', capacity_mw: 'Capacity (MW)',
    ppa_off_taker: 'PPA / Off-taker', channel_mix: 'Channel Mix', brand_strength: 'Brand Strength',
    sku_portfolio: 'SKU Portfolio', infrastructure_type: 'Infrastructure Type', contract_quality: 'Contract Quality',
    geography_coverage: 'Geography Coverage', accreditations: 'Accreditations', enrolment_scale: 'Enrolment Scale',
    founder_dependency: 'Founder Dependency', product_type: 'Product Type', export_revenue_pct: 'Export Revenue %',
    compliance_status: 'Compliance Status', asset_ownership: 'Asset Ownership', performance_history: 'Performance History',
    location_spread: 'Location Spread', regulatory_licences: 'Regulatory Licences', debt_structure: 'Debt Structure',
    business_model: 'Business Model', capabilities: 'Capabilities', government_oem_exposure: 'Government/OEM Exposure',
    technology_rd_focus: 'Technology / R&D Focus',
};

export interface BusinessDataField {
    key: string;
    label: string;
    value: string;
}

function extractSafeIndustryData(metadata: Record<string, unknown> | null | undefined): BusinessDataField[] {
    if (!metadata || typeof metadata !== 'object') return [];
    const fields: BusinessDataField[] = [];
    for (const key of SAFE_INDUSTRY_DATA_KEYS) {
        const raw = metadata[key];
        if (raw === null || raw === undefined || raw === '') continue;
        const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
        if (!value.trim()) continue;
        fields.push({ key, label: FIELD_LABELS[key] || key, value });
    }
    return fields;
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
    businessData: BusinessDataField[]; // structured, non-identifying business attributes (allowlisted)
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
    const businessData = extractSafeIndustryData(cp.metadata);
    const strategicRationale = buildSafeStrategicRationale(cp, industry, businessData);

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
        businessData,
        teaser,
        // Pre-EOI: paragraph-form rationale built from the same safe inputs as `teaser` — was
        // the bare teaser fragment itself ("Buy-side acquisition — PHARMACEUTICALS...").
        anonymizedPreview: strategicRationale,
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