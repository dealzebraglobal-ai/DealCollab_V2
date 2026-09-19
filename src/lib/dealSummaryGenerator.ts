/**
 * DealCollab — M&A Deal Intelligence Summary Generator & Privacy Layer
 * ======================================================================
 * Place at: src/lib/dealSummaryGenerator.ts
 *
 * Requirements:
 * 1. Produces full-fledged, professional M&A intelligence deal summaries (150-300 words).
 * 2. Uses the complete available mandate and candidate row data (intent, industry, sector,
 *    sub-sector, geography, revenue, deal size, business model, transaction structure,
 *    operating parameters from metadata/industry_data).
 * 3. Explains WHY it matches: aligned criteria, unavailable criteria, and partial alignments.
 * 4. Deterministic sanitization layer: strictly redacts names, emails, phone numbers,
 *    WhatsApp handles, internal IDs, UUIDs, and document URLs BEFORE summary rendering.
 * 5. Preserves Identity Protected model — never names the counterparty company.
 */

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface MandateSummaryInput {
  intent?: string | null;
  industry?: string | null;
  sector?: string | null;
  sectors?: string[] | null;
  sub_sector?: string | null;
  geography?: string | null;
  geographies?: string[] | null;
  deal_size_min?: string | number | null;
  deal_size_max?: string | number | null;
  revenue_min?: string | number | null;
  revenue_max?: string | number | null;
  structure?: string | null;
  intent_focus?: string | null;
  industry_data?: Record<string, unknown> | null;
  special_conditions?: string[] | null;
  currency?: string | null;
  urgency?: string | null;
  buyer_type?: string | null;
  raw_text?: string | null;
  normalised_text?: string | null;
}

export interface CandidateSummaryInput {
  id?: string;
  intent?: string | null;
  industry?: string | null;
  sectors?: string[] | null;
  geographies?: string[] | null;
  deal_size_min_cr?: number | null;
  deal_size_max_cr?: number | null;
  revenue_min_cr?: number | null;
  revenue_max_cr?: number | null;
  deal_structure?: string | null;
  metadata?: Record<string, unknown> | null;
  quality_tier?: number | null;
  raw_text?: string | null;
  normalised_text?: string | null;
}

export interface MatchingResultSummaryInput {
  finalScore?: number;
  similarityScore?: number;
  industryScore?: number;
  financialScore?: number;
  geoScore?: number;
  archetype?: string;
  matchReason?: string;
  industryCompatibility?: 'EXACT' | 'ADJACENT' | 'COMPATIBLE' | 'NARROW' | 'INCOMPATIBLE';
}

// ─────────────────────────────────────────────────────────────
// DETERMINISTIC SANITIZATION & PRIVACY LAYER
// ─────────────────────────────────────────────────────────────

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4,6}\b/g;
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const URL_REGEX = /https?:\/\/[^\s$.?#].[^\s]*/gi;
const CONTACT_PROMPT_REGEX = /\b(call|contact|whatsapp|reach|email|phone)\s+([A-Z][a-z]+(\s+[A-Z][a-z]+)?)\b/gi;

/**
 * Deterministically strips confidential identifiers and personal contact details
 * from any text before sending or rendering.
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(EMAIL_REGEX, '[confidential email]')
    .replace(PHONE_REGEX, (match) => {
      // Don't redact simple small numbers or years (e.g. 2024, 100)
      const digitsOnly = match.replace(/\D/g, '');
      if (digitsOnly.length >= 7) return '[confidential phone]';
      return match;
    })
    .replace(UUID_REGEX, '[reference-id]')
    .replace(URL_REGEX, '[confidential link]')
    .replace(CONTACT_PROMPT_REGEX, '$1 [identity protected]');
}

// ─────────────────────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function formatAmountCr(min: number | null, max: number | null, unit = 'Cr'): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    if (min === max) return `₹${min} ${unit}`;
    return `₹${min}–${max} ${unit}`;
  }
  if (max != null) return `up to ₹${max} ${unit}`;
  return `₹${min}+ ${unit}`;
}

function normalizeStr(str: unknown): string | null {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanLabel(str: string | null | undefined): string {
  if (!str) return '';
  const trimmed = str.replace(/_/g, ' ').trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'fmcg') return 'FMCG';
  if (lower === 'd2c') return 'D2C';
  if (lower === 'b2b') return 'B2B';
  if (lower === 'b2c') return 'B2C';
  if (lower === 'oem') return 'OEM';
  if (lower === 'pan-india' || lower === 'pan india') return 'Pan-India';

  return trimmed
    .split(/\s+/)
    .map(word => {
      const wLower = word.toLowerCase();
      if (['and', '&', 'in', 'of', 'for', 'the', 'with'].includes(wLower)) return wLower;
      if (['fmcg', 'd2c', 'b2b', 'b2c', 'oem', 'api', 'cdmo'].includes(wLower)) return wLower.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatGeo(geo: string | null | undefined): string {
  if (!geo) return 'Pan-India';
  const gLower = geo.toLowerCase().trim();
  if (gLower === 'pan-india' || gLower === 'pan india') return 'Pan-India';
  return cleanLabel(geo);
}

function formatBusinessModel(model: string | null | undefined): string | null {
  if (!model) return null;
  const lower = model.toLowerCase();
  if (lower.includes('contract_manufacturing') || lower.includes('contract manufacturing') || lower.includes('cdmo') || lower.includes('crams') || lower.includes('oem')) {
    return 'contract manufacturing with OEM supplier capabilities';
  }
  if (lower.includes('b2b')) return 'B2B enterprise supply model';
  if (lower.includes('d2c') || lower.includes('b2c')) return 'direct-to-consumer (D2C) brand operations';
  return cleanLabel(model);
}

// ─────────────────────────────────────────────────────────────
// FULL-FLEDGED DEAL INTELLIGENCE SUMMARY GENERATOR
// ─────────────────────────────────────────────────────────────

export function generateFullDealSummary(
  source: MandateSummaryInput,
  candidate: CandidateSummaryInput,
  result: MatchingResultSummaryInput = {}
): string {
  const sections: string[] = [];

  // Extract structured values
  const sIntent = source.intent || 'BUY_SIDE';
  const cIntent = candidate.intent || (sIntent === 'BUY_SIDE' ? 'SELL_SIDE' : 'BUY_SIDE');

  const rawIndustry = candidate.industry || source.industry || candidate.sectors?.[0] || source.sector || 'Target Business';
  const rawSector = candidate.sectors?.[0] || source.sector || rawIndustry;
  const targetIndustry = cleanLabel(rawIndustry);
  const targetSector = cleanLabel(rawSector);
  const targetGeo = formatGeo(candidate.geographies?.[0] || source.geography);

  const cRevMin = candidate.revenue_min_cr != null ? candidate.revenue_min_cr : parseNum(candidate.metadata?.revenue_min_cr);
  const cRevMax = candidate.revenue_max_cr != null ? candidate.revenue_max_cr : parseNum(candidate.metadata?.revenue_max_cr);
  const cSizeMin = candidate.deal_size_min_cr != null ? candidate.deal_size_min_cr : parseNum(candidate.metadata?.deal_size_min_cr);
  const cSizeMax = candidate.deal_size_max_cr != null ? candidate.deal_size_max_cr : parseNum(candidate.metadata?.deal_size_max_cr);

  const sRevMin = parseNum(source.revenue_min);
  const sRevMax = parseNum(source.revenue_max);
  const sSizeMin = parseNum(source.deal_size_min);
  const sSizeMax = parseNum(source.deal_size_max);

  const candidateRevStr = formatAmountCr(cRevMin, cRevMax);
  const candidateSizeStr = formatAmountCr(cSizeMin, cSizeMax);
  const sourceRevStr = formatAmountCr(sRevMin, sRevMax);
  const sourceSizeStr = formatAmountCr(sSizeMin, sSizeMax);

  const cMeta = candidate.metadata || {};
  const sMeta = source.industry_data || {};

  // ─────────────────────────────────────────────────────────────
  // 1. MATCH OVERVIEW
  // ─────────────────────────────────────────────────────────────
  const txTypeMap: Record<string, string> = {
    SELL_SIDE: 'sell-side divestment / equity acquisition',
    BUY_SIDE: 'strategic buy-side acquisition',
    FUNDRAISING: 'growth equity funding / structured capital expansion',
    DEBT: 'debt financing / structured credit facility',
    STRATEGIC_PARTNERSHIP: 'strategic partnership / joint venture',
  };
  const txType = txTypeMap[cIntent] || 'strategic M&A transaction';

  let overview = `### Strategic Acquisition & Growth Opportunity\nThis is a ${txType} opportunity in the ${targetIndustry} space within the broader ${targetSector} sector. The opportunity centers on established operations located in ${targetGeo}, serving commercial clients and market demand across the region.`;
  
  if (candidateRevStr || candidateSizeStr) {
    const scaleParts: string[] = [];
    if (candidateRevStr) scaleParts.push(`annual revenue of ${candidateRevStr}`);
    if (candidateSizeStr) scaleParts.push(`valuation / deal scale of ${candidateSizeStr}`);
    overview += ` Reported operational scale indicates ${scaleParts.join(' with a ')}.`;
  }
  sections.push(overview);

  // ─────────────────────────────────────────────────────────────
  // 2. BUSINESS & TRANSACTION PROFILE
  // ─────────────────────────────────────────────────────────────
  const profileParts: string[] = [];

  // Business Model & Operating Attributes
  const rawModel = (cMeta.business_model as string) || (sMeta.business_model as string) || (cMeta.model as string);
  const formattedModel = formatBusinessModel(rawModel);
  if (formattedModel) {
    profileParts.push(`operating model featuring ${formattedModel}`);
  }

  // Contract Manufacturing
  const hasContractMfg = Boolean(
    cMeta.contract_manufacturing ||
    sMeta.contract_manufacturing ||
    (cMeta.business_model as string)?.includes('contract_manufacturing') ||
    candidate.raw_text?.toLowerCase().includes('contract manufacturing')
  );
  if (hasContractMfg && !formattedModel?.includes('contract manufacturing')) {
    profileParts.push('established Contract Manufacturing networks');
  }

  // Capacity / Facility
  const capacity = normalizeStr(cMeta.capacity) || normalizeStr(cMeta.installed_capacity) || normalizeStr(cMeta.manufacturing_capacity);
  if (capacity) {
    profileParts.push(`production capacity of ${capacity}`);
  }

  // Distribution / Channels
  const channel = normalizeStr(cMeta.channel_mix) || normalizeStr(cMeta.distribution_channel) || normalizeStr(cMeta.channel);
  if (channel) {
    profileParts.push(`structured ${channel} distribution channels`);
  }

  // Regulatory / Certifications
  const certs = normalizeStr(cMeta.certifications) || normalizeStr(cMeta.regulatory_approvals);
  if (certs) {
    profileParts.push(`established compliance credentials (${certs})`);
  }

  // Transaction structure
  const structure = candidate.deal_structure || source.structure || 'majority / 100% buyout';
  let profileSentence = `### Business & Transaction Profile\n` + (profileParts.length > 0
    ? `The counterparty profile reflects an established business with ${profileParts.join(', ')}. `
    : `The counterparty operates a specialized enterprise focused on consistent commercial delivery. `);

  profileSentence += `Preferred transaction structure involves ${structure}.`;
  sections.push(profileSentence);

  // ─────────────────────────────────────────────────────────────
  // 3. STRATEGIC FIT & ALIGNMENT
  // ─────────────────────────────────────────────────────────────
  const alignments: string[] = [];

  // Industry fit
  if (candidate.industry && source.industry) {
    const sInd = source.industry.toLowerCase();
    const cInd = candidate.industry.toLowerCase();
    if (sInd === cInd || sInd.includes(cInd) || cInd.includes(sInd)) {
      alignments.push(`direct sector alignment on ${targetIndustry}`);
    } else {
      alignments.push(`complementary vertical focus in ${targetIndustry}`);
    }
  } else if (targetIndustry) {
    alignments.push(`targeted relevance to the mandate's ${targetIndustry} requirements`);
  }

  // Geography fit
  if (source.geography && candidate.geographies?.length) {
    const sGeo = source.geography.toLowerCase();
    const cGeos = candidate.geographies.map(g => g.toLowerCase());
    if (cGeos.some(g => g.includes(sGeo) || sGeo.includes(g) || sGeo === 'pan-india' || sGeo === 'india')) {
      alignments.push(`geographic presence corresponding to the target ${source.geography} footprint`);
    }
  }

  // Financial alignment
  if (sRevMin != null && cRevMin != null) {
    if (cRevMin >= sRevMin) {
      alignments.push(`reported revenue (${candidateRevStr}) satisfying the mandate's minimum threshold (${sourceRevStr})`);
    } else {
      alignments.push(`revenue scale approaching mandate parameters`);
    }
  } else if (sSizeMin != null && cSizeMin != null) {
    alignments.push(`deal ticket sizing aligned with the targeted ${sourceSizeStr} range`);
  }

  // Business model alignment (e.g. Contract Manufacturing)
  const sCm = (sMeta.business_model as string)?.includes('contract_manufacturing') || JSON.stringify(source.special_conditions || []).includes('contract_manufacturing');
  const cCm = (cMeta.business_model as string)?.includes('contract_manufacturing') || candidate.normalised_text?.toLowerCase().includes('contract manufacturing');
  if (sCm && cCm) {
    alignments.push('specific alignment on contract manufacturing exposure matching stated mandate preferences');
  }

  // Strategic scoring alignment (filter out generic or duplicate reasons)
  if (result.matchReason) {
    const rawReason = result.matchReason.replace(/\.$/, '').trim();
    // If rawReason just echoes sector/geography (e.g. "FMCG in pan-India. New counterparty mandate aligned..."), extract the clean action clause
    const parts = rawReason.split(/\.\s+/);
    const cleanClause = parts.length > 1 ? parts.slice(1).join('. ') : rawReason;
    if (cleanClause && !cleanClause.toLowerCase().includes('aligned with your active position')) {
      alignments.push(`strategic rationale: ${cleanClause}`);
    } else if (result.archetype) {
      alignments.push(`archetype alignment (${result.archetype.replace(/_/g, ' ').toLowerCase()})`);
    }
  } else if (result.archetype) {
    alignments.push(`archetype alignment (${result.archetype.replace(/_/g, ' ').toLowerCase()})`);
  }

  const fitText = `### Strategic Fit & Market Synergy\nThe opportunity aligns strongly with the sponsor's mandate parameters. Primary drivers of compatibility include ${alignments.length > 0 ? alignments.join(', ') : 'sector focus and operational scope'}.`;
  sections.push(fitText);

  // ─────────────────────────────────────────────────────────────
  // 4. MATCH CONSIDERATIONS & DATA AVAILABILITY
  // ─────────────────────────────────────────────────────────────
  const considerations: string[] = [];

  const ebitda = normalizeStr(cMeta.ebitda) || normalizeStr(cMeta.profitability) || normalizeStr(cMeta.margins);
  if (ebitda) {
    considerations.push(`Profitability profile reflects ${ebitda}`);
  } else {
    considerations.push('EBITDA and operating margin details were not disclosed in the preliminary candidate record and will require review during bilateral discussions');
  }

  const clientConc = normalizeStr(cMeta.client_concentration) || normalizeStr(cMeta.client_profile);
  if (clientConc) {
    considerations.push(`Customer base is reported as ${clientConc}`);
  }

  const considerationText = `### Key Deal Considerations\n` + considerations.join('. ') + '.';
  sections.push(considerationText);

  // Combine and sanitize
  const rawSummary = sections.join('\n\n');
  return sanitizeText(rawSummary);
}

/**
 * Builds an anonymized executive brief for a mandate row to store in summary_text / metadata
 */
export function buildEnhancedMandateBrief(input: MandateSummaryInput): string {
  return generateFullDealSummary(input, {
    industry: input.industry,
    sectors: input.sector ? [input.sector] : [],
    geographies: input.geography ? [input.geography] : [],
    deal_size_min_cr: parseNum(input.deal_size_min),
    deal_size_max_cr: parseNum(input.deal_size_max),
    revenue_min_cr: parseNum(input.revenue_min),
    revenue_max_cr: parseNum(input.revenue_max),
    deal_structure: input.structure,
    metadata: input.industry_data,
  });
}
