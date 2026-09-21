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
 * 3. States fit as facts side by side (both sides' values, ranges checked at both ends).
 *    Never asserts alignment and never describes the counterparty with the viewer's data.
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
  serving_sectors?: string[] | null;
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
  serving_sectors?: string[] | null;
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
// Truth rules — each one fixes a way the previous version misled users:
//   1. The counterparty is described ONLY from its own row. No fallback to the
//      viewer's mandate: a missing field is reported as not disclosed.
//   2. Fit is stated as facts side by side, with ranges checked against BOTH
//      ends. Nothing asserts that the opportunity "aligns strongly".
//   3. A single mandate's stored brief has nothing to be compared against, so it
//      carries no fit section. (It used to compare the row with itself.)
// ─────────────────────────────────────────────────────────────

const TX_TYPE: Record<string, string> = {
  SELL_SIDE: 'sell-side divestment / equity acquisition',
  BUY_SIDE: 'strategic buy-side acquisition',
  FUNDRAISING: 'growth equity funding / structured capital expansion',
  DEBT: 'debt financing / structured credit facility',
  STRATEGIC_PARTNERSHIP: 'strategic partnership / joint venture',
};

/** Revenue and deal-size figures from the counterparty's own row (columns first, then its own metadata). */
function candidateFigures(candidate: CandidateSummaryInput) {
  const m = candidate.metadata || {};
  return {
    revMin: parseNum(candidate.revenue_min_cr) ?? parseNum(m.revenue_min_cr),
    revMax: parseNum(candidate.revenue_max_cr) ?? parseNum(m.revenue_max_cr),
    sizeMin: parseNum(candidate.deal_size_min_cr) ?? parseNum(m.deal_size_min_cr),
    sizeMax: parseNum(candidate.deal_size_max_cr) ?? parseNum(m.deal_size_max_cr),
  };
}

/** Relation between the counterparty's figure/range and the viewer's, checked against both ends. */
function compareRange(cMin: number | null, cMax: number | null, sMin: number | null, sMax: number | null): string | null {
  if (sMin == null && sMax == null) return null; // viewer stated nothing to compare against
  const yours = formatAmountCr(sMin, sMax) as string;
  if (cMin == null && cMax == null) return `not disclosed (yours: ${yours})`;
  const theirs = formatAmountCr(cMin, cMax) as string;
  const lo = (cMin ?? cMax) as number;
  const hi = (cMax ?? cMin) as number;
  const sLo = sMin ?? -Infinity;
  const sHi = sMax ?? Infinity;
  let verdict: string;
  if (lo > sHi) verdict = 'above your range';
  else if (hi < sLo) verdict = 'below your range';
  else if (lo >= sLo && hi <= sHi) verdict = 'within your range';
  else if (sLo >= lo && sHi <= hi) verdict = 'covers your range';
  else verdict = 'partly overlaps your range';
  return `${theirs} vs your ${yours}, ${verdict}`;
}

/** Overview, profile and considerations, built from the counterparty's own fields only. */
function describeCounterparty(candidate: CandidateSummaryInput): { overview: string; profile: string; considerations: string } {
  const cMeta = candidate.metadata || {};
  const txType = (candidate.intent && TX_TYPE[candidate.intent]) || 'strategic M&A transaction';

  // Industry first; the coarse sector tag only when no industry is recorded.
  const industry = normalizeStr(candidate.industry);
  const sector = normalizeStr(candidate.sectors?.[0]);
  const where = industry ? ` in the ${cleanLabel(industry)} space` : sector ? ` in the ${cleanLabel(sector)} sector` : '';

  let overview = `### Opportunity Overview\nThis is a ${txType} opportunity${where}.`;
  const serving = (candidate.serving_sectors ?? []).map(cleanLabel).filter(Boolean).join(', ');
  if (serving) overview += ` The business serves clients in the ${serving} sector(s).`;
  const geo = normalizeStr(candidate.geographies?.[0]);
  overview += geo ? ` Location: ${formatGeo(geo)}.` : ' Location: not disclosed.';

  // For a buy-side mandate these figures describe the TARGET, not the buyer itself.
  const isBuyer = candidate.intent === 'BUY_SIDE';
  const f = candidateFigures(candidate);
  const revStr = formatAmountCr(f.revMin, f.revMax);
  const sizeStr = formatAmountCr(f.sizeMin, f.sizeMax);
  if (revStr) overview += isBuyer ? ` Target revenue: ${revStr}.` : ` Reported annual revenue: ${revStr}.`;
  if (sizeStr) overview += isBuyer ? ` Target deal size: ${sizeStr}.` : ` Deal size: ${sizeStr}.`;

  const profileParts: string[] = [];
  const businessModel = normalizeStr(cMeta.business_model);
  const formattedModel = formatBusinessModel(businessModel || normalizeStr(cMeta.model));
  if (formattedModel) profileParts.push(`operating model featuring ${formattedModel}`);

  const hasContractMfg = Boolean(
    cMeta.contract_manufacturing ||
    businessModel?.includes('contract_manufacturing') ||
    candidate.raw_text?.toLowerCase().includes('contract manufacturing')
  );
  if (hasContractMfg && !formattedModel?.includes('contract manufacturing')) {
    profileParts.push('contract manufacturing operations');
  }

  const capacity = normalizeStr(cMeta.capacity) || normalizeStr(cMeta.installed_capacity) || normalizeStr(cMeta.manufacturing_capacity);
  if (capacity) profileParts.push(`production capacity of ${capacity}`);

  const channel = normalizeStr(cMeta.channel_mix) || normalizeStr(cMeta.distribution_channel) || normalizeStr(cMeta.channel);
  if (channel) profileParts.push(`${channel} distribution channels`);

  const certs = normalizeStr(cMeta.certifications) || normalizeStr(cMeta.regulatory_approvals);
  if (certs) profileParts.push(`compliance credentials (${certs})`);

  let profile = `### Business & Transaction Profile\n` + (profileParts.length > 0
    ? `Disclosed operating attributes: ${profileParts.join(', ')}.`
    : `Operating details were not disclosed.`);
  const structure = normalizeStr(candidate.deal_structure);
  profile += structure ? ` Stated transaction structure: ${structure}.` : ` Transaction structure: not disclosed.`;

  const considerationParts: string[] = [];
  const ebitda = normalizeStr(cMeta.ebitda) || normalizeStr(cMeta.profitability) || normalizeStr(cMeta.margins);
  if (ebitda) {
    considerationParts.push(`Profitability profile reflects ${ebitda}`);
  } else {
    considerationParts.push('EBITDA and operating margin details were not disclosed in the preliminary candidate record and will require review during bilateral discussions');
  }
  const clientConc = normalizeStr(cMeta.client_concentration) || normalizeStr(cMeta.client_profile);
  if (clientConc) considerationParts.push(`Customer base is reported as ${clientConc}`);
  const considerations = `### Key Deal Considerations\n` + considerationParts.join('. ') + '.';

  return { overview, profile, considerations };
}

/** Side-by-side facts against the viewer's mandate. Relations are stated only where both sides disclosed a value. */
function assessFit(source: MandateSummaryInput, candidate: CandidateSummaryInput, result: MatchingResultSummaryInput): string {
  const lines: string[] = [];

  const sInd = normalizeStr(source.industry);
  const cInd = normalizeStr(candidate.industry);
  if (sInd) {
    if (!cInd) lines.push(`Industry: not disclosed (your target: ${cleanLabel(sInd)})`);
    else if (cInd.toLowerCase() === sInd.toLowerCase()) lines.push(`Industry: ${cleanLabel(cInd)}, same as your target`);
    else lines.push(`Industry: ${cleanLabel(cInd)} vs your target ${cleanLabel(sInd)}`);
  }

  const sGeo = normalizeStr(source.geography);
  const cGeo = normalizeStr(candidate.geographies?.[0]);
  if (sGeo) lines.push(cGeo ? `Location: ${formatGeo(cGeo)} vs your target ${sGeo}` : `Location: not disclosed (your target: ${sGeo})`);

  const f = candidateFigures(candidate);
  const rev = compareRange(f.revMin, f.revMax, parseNum(source.revenue_min), parseNum(source.revenue_max));
  if (rev) lines.push(`Revenue: ${rev}`);
  const size = compareRange(f.sizeMin, f.sizeMax, parseNum(source.deal_size_min), parseNum(source.deal_size_max));
  if (size) lines.push(`Deal size: ${size}`);

  if (result.industryCompatibility === 'NARROW' || result.industryCompatibility === 'INCOMPATIBLE') {
    lines.push(`The matching engine rated industry fit as ${result.industryCompatibility.toLowerCase()}; verify relevance before sending an EOI`);
  }

  return `### Fit Against Your Mandate\n` + (lines.length > 0
    ? `${lines.join('. ')}.`
    : 'No criteria were disclosed on both sides to compare.');
}

export function generateFullDealSummary(
  source: MandateSummaryInput,
  candidate: CandidateSummaryInput,
  result: MatchingResultSummaryInput = {}
): string {
  const d = describeCounterparty(candidate);
  return sanitizeText([d.overview, d.profile, assessFit(source, candidate, result), d.considerations].join('\n\n'));
}

/**
 * Builds an anonymized executive brief for a mandate row to store in summary_text / metadata.
 * Describes the mandate only: a single mandate has nothing to be compared against.
 * (Previously it passed the mandate in as its own counterparty, which produced
 * self-confirming fit claims and an inverted intent.)
 */
export function buildEnhancedMandateBrief(input: MandateSummaryInput): string {
  const d = describeCounterparty({
    intent: input.intent,
    industry: input.industry,
    sectors: input.sector ? [input.sector] : [],
    serving_sectors: input.serving_sectors,
    geographies: input.geography ? [input.geography] : [],
    deal_size_min_cr: parseNum(input.deal_size_min),
    deal_size_max_cr: parseNum(input.deal_size_max),
    revenue_min_cr: parseNum(input.revenue_min),
    revenue_max_cr: parseNum(input.revenue_max),
    deal_structure: input.structure,
    metadata: input.industry_data,
  });
  return sanitizeText([d.overview, d.profile, d.considerations].join('\n\n'));
}