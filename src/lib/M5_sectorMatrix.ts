/**
 * DealCollab — M5: Sector Compatibility Matrix
 * =============================================
 * Source: DC-KB-003 v1.0 — derived from 348 real Indian M&A transactions
 * Place at: src/lib/M5_sectorMatrix.ts
 *
 * Exports:
 *   normalizeSector()        — maps promptRouter SectorKeys → DC-KB-003 codes
 *   getSectorCompatibility() — returns compatibility level + reason for any pair
 *   MATCH_ARCHETYPES         — match type labels for match cards
 *   detectFraudSignals()     — HR-8 fraud signal detection
 */

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type CompatibilityLevel = 'COMPATIBLE' | 'NARROW' | 'INCOMPATIBLE';

export interface SectorRelation {
  level: CompatibilityLevel;
  penalty: number;   // score deduction applied in calculateV2Score()
  reason: string;   // shown on match card
}

// ─────────────────────────────────────────────────────────────
// SECTOR NORMALIZATION
// promptRouter lowercase keys → DC-KB-003 uppercase canonical codes
// ─────────────────────────────────────────────────────────────

const NORMALIZE_MAP: Record<string, string> = {
  pharma: 'PHARMACEUTICALS',
  pharmaceutical: 'PHARMACEUTICALS',
  pharmaceuticals: 'PHARMACEUTICALS',
  healthcare: 'HEALTHCARE',
  hospitals: 'HEALTHCARE',
  hospital: 'HEALTHCARE',
  manufacturing: 'MANUFACTURING',
  saas: 'TECHNOLOGY',
  software: 'TECHNOLOGY',
  technology: 'TECHNOLOGY',
  finserv: 'FINTECH',
  consumer: 'FMCG',
  fmcg: 'FMCG',
  realestate: 'REAL_ESTATE',
  'real estate': 'REAL_ESTATE',
  logistics: 'LOGISTICS',
  education: 'EDUCATION',
  chemicals: 'CHEMICALS',
  hospitality: 'HOTELS',
  hotels: 'HOTELS',
  renewable: 'RENEWABLE_ENERGY',
  'renewable energy': 'RENEWABLE_ENERGY',
  defence: 'DEFENCE',
  defense: 'DEFENCE',
  oil_gas: 'OIL_GAS',
  'oil & gas': 'OIL_GAS',
  ngo: 'NGO',
  mixed: 'GENERAL',
  // sub-sector overrides
  nbfc: 'NBFC',
  fintech: 'FINTECH',
  'auto ancillary': 'AUTO_ANCILLARY',
  ev: 'EV_MOBILITY',
  // specific product industries
  toy: 'TOYS',
  toys: 'TOYS',
  fashion: 'FASHION',
  textiles: 'HOME_TEXTILES',
  'home textiles': 'HOME_TEXTILES',
  cybersecurity: 'CYBERSECURITY',
  'cyber security': 'CYBERSECURITY',
  'ot security': 'CYBERSECURITY',
  'water treatment': 'WATER_TREATMENT',
  'water & wastewater': 'WATER_TREATMENT',
  wastewater: 'WATER_TREATMENT',
  'wastewater treatment': 'WATER_TREATMENT',
  'effluent treatment': 'WATER_TREATMENT',
  'water recycling': 'WATER_TREATMENT',
  'environmental services': 'WATER_TREATMENT',
  etp: 'WATER_TREATMENT',
  stp: 'WATER_TREATMENT',
  zld: 'WATER_TREATMENT',
  'sheet metal': 'SHEET_METAL_MANUFACTURING',
  'sheet metal manufacturing': 'SHEET_METAL_MANUFACTURING',
  'pump manufacturing': 'PUMP_MANUFACTURING',
};

export function normalizeSector(raw: string): string {
  if (!raw) return 'GENERAL';
  const lower = raw.toLowerCase().trim();
  return NORMALIZE_MAP[lower] ?? raw.toUpperCase().replace(/[\s-]+/g, '_');
}

// ─────────────────────────────────────────────────────────────
// HARD INCOMPATIBLE PAIRS (symmetric)
// Zero occurrences in 348 deals + no plausible business logic
// ─────────────────────────────────────────────────────────────

const HARD_INCOMPATIBLE = new Set<string>([
  'PHARMACEUTICALS|REAL_ESTATE',
  'PHARMACEUTICALS|HOTELS',
  'PHARMACEUTICALS|RETAIL',
  'PHARMACEUTICALS|DEFENCE',
  'HEALTHCARE|RETAIL',
  'HEALTHCARE|REAL_ESTATE',
  'HEALTHCARE|DEFENCE',
  'NBFC|MANUFACTURING',
  'NBFC|REAL_ESTATE',
  'NBFC|LOGISTICS',
  'NBFC|HOTELS',
  'TECHNOLOGY|REAL_ESTATE',
  'TECHNOLOGY|HOTELS',
  'MANUFACTURING|EDUCATION',
  'MANUFACTURING|NBFC',
  'MANUFACTURING|RETAIL',
  'RENEWABLE_ENERGY|RETAIL',
  'RENEWABLE_ENERGY|EDUCATION',
  'RENEWABLE_ENERGY|HOTELS',
  'FMCG|NBFC',
  'FMCG|DEFENCE',
  'FMCG|PHARMACEUTICALS',
  'EDUCATION|LOGISTICS',
  'EDUCATION|CHEMICALS',
  'REAL_ESTATE|LOGISTICS',
  'DEFENCE|RETAIL',
  'DEFENCE|FMCG',
  'DEFENCE|EDUCATION',
  'CHEMICALS|NBFC',
  'CHEMICALS|RETAIL',
  'CHEMICALS|HOTELS',
]);

function isHardIncompatible(s: string, t: string): boolean {
  return HARD_INCOMPATIBLE.has(`${s}|${t}`) || HARD_INCOMPATIBLE.has(`${t}|${s}`);
}

// ─────────────────────────────────────────────────────────────
// COMPATIBLE PAIRS — observed in dataset with deal rationale
// ─────────────────────────────────────────────────────────────

const COMPATIBLE: Record<string, string> = {
  'TECHNOLOGY|AUTO_ANCILLARY': 'Tech closes hardware-software gap. Factory automation requires software intelligence layer. 13 deals observed.',
  'AUTO_ANCILLARY|TECHNOLOGY': 'Auto component maker adds digital layer for Industry 4.0 OEM requirements. 6 deals observed.',
  'MANUFACTURING|AUTO_ANCILLARY': 'OEM supply consolidation — same clients, adjacent component. 7 deals observed.',
  'AUTO_ANCILLARY|MANUFACTURING': 'Tier-1 acquires Tier-2 supplier. Same OEM relationships, adjacent capability.',
  'AUTO_ANCILLARY|EV_MOBILITY': 'Auto component maker transitions to EV-compatible parts. Platform changeover thesis.',
  'EV_MOBILITY|AUTO_ANCILLARY': 'EV platform acquires component capability — vertical integration of supply chain.',
  'MANUFACTURING|EV_MOBILITY': 'Industrial manufacturer adds EV capability for fleet and energy clients.',
  'EV_MOBILITY|MANUFACTURING': 'EV company acquires manufacturing capacity for scale-up.',
  'EV_MOBILITY|RENEWABLE_ENERGY': 'EV + renewable — charging infrastructure powered by clean energy.',
  'RENEWABLE_ENERGY|EV_MOBILITY': 'Renewable energy company adds EV charging as downstream application.',
  'TECHNOLOGY|NBFC': 'Fintech acquires RBI NBFC licence — regulatory shortcut. Fresh licence 18–24 months. 5 deals.',
  'NBFC|FINTECH': 'NBFC adds fintech platform for digital loan distribution.',
  'FINTECH|NBFC': 'Fintech acquires lending licence to activate embedded finance.',
  'TECHNOLOGY|FINTECH': 'Tech-adjacent — software + financial services integration.',
  'FINTECH|TECHNOLOGY': 'Fintech acquires tech platform to power digital lending or payments.',
  'TECHNOLOGY|PHARMACEUTICALS': 'Pharma software — clinical trials, regulatory submissions, QMS. 5 deals.',
  'TECHNOLOGY|HEALTHCARE': 'Digital health — telemedicine, diagnostic AI, hospital management systems.',
  'HEALTHCARE|TECHNOLOGY': 'Healthcare business acquires digital health platform.',
  'PHARMACEUTICALS|HEALTHCARE': 'Pharma conglomerate expands into hospital/diagnostic network.',
  'HEALTHCARE|PHARMACEUTICALS': 'Hospital chain acquires pharma supply — backward integration.',
  'MANUFACTURING|RENEWABLE_ENERGY': 'Industrial manufacturer adds renewable capability for existing client energy needs. 3 deals.',
  'MANUFACTURING|CHEMICALS': 'Chemical inputs supplier acquired by manufacturer — backward integration.',
  'CHEMICALS|MANUFACTURING': 'Chemical company acquires manufacturing capacity.',
  'CHEMICALS|PHARMACEUTICALS': 'Chemical intermediate supplier acquires downstream pharma. 2 deals.',
  'PHARMACEUTICALS|CHEMICALS': 'Pharma acquires chemical feedstock for supply chain security.',
  'CHEMICALS|HEALTHCARE': 'Medical consumables or diagnostics chemicals adjacency.',
  'FMCG|MANUFACTURING': 'FMCG brand acquires manufacturing for in-house production. 2 deals.',
  'MANUFACTURING|FMCG': 'Manufacturer acquires FMCG brand for B2C market access.',
  'FMCG|RETAIL': 'FMCG brand acquires retail distribution — channel expansion.',
  'RETAIL|FMCG': 'Retail chain acquires FMCG brand to create private label portfolio.',
  'REAL_ESTATE|HOTELS': 'Real estate developer acquires hospitality asset.',
  'HOTELS|REAL_ESTATE': 'Hotel chain acquires property for flagship asset ownership.',
  'TECHNOLOGY|EDUCATION': 'Edtech — software platform serving education institutions.',
  'EDUCATION|TECHNOLOGY': 'Education institution acquires edtech for digital delivery.',
  'FINANCIAL_SERVICES|NBFC': 'Financial services firm acquires NBFC for lending product.',
  'FINANCIAL_SERVICES|FINTECH': 'Wealth management adds fintech platform.',
  'AUTO_ANCILLARY|DEFENCE': 'Precision engineering capabilities dual-use for defence components.',
  'DEFENCE|MANUFACTURING': 'Defence OEM acquires manufacturing capacity.',
  'MANUFACTURING|DEFENCE': 'Manufacturer adds defence vertical — government contract diversification.',
};

// ─────────────────────────────────────────────────────────────
// NARROW PAIRS — conditional compatibility (-10 score penalty)
// ─────────────────────────────────────────────────────────────

const NARROW: Record<string, string> = {
  'LOGISTICS|PHARMACEUTICALS': 'NARROW: Pharma-grade cold chain logistics only. Verify certification.',
  'LOGISTICS|HEALTHCARE': 'NARROW: Medical supply chain only. Verify temperature-controlled capability.',
  'LOGISTICS|FMCG': 'NARROW: FMCG last-mile delivery. Verify route density.',
  'LOGISTICS|MANUFACTURING': 'NARROW: Industrial logistics only. Verify captive client or MSA contracts.',
  'MANUFACTURING|PHARMACEUTICALS': 'NARROW: Contract manufacturing or packaging only.',
  'PHARMACEUTICALS|MANUFACTURING': 'NARROW: Pharma packaging or equipment supplier only.',
  'HEALTHCARE|LOGISTICS': 'NARROW: Medical supply logistics only.',
  'HEALTHCARE|TECHNOLOGY': 'NARROW: Healthtech platforms only — telemedicine, diagnostic AI.',
  'AUTO_ANCILLARY|NBFC': 'NARROW: Fleet finance or vehicle finance NBFC only.',
  'RETAIL|TECHNOLOGY': 'NARROW: Retail-tech — POS, inventory, e-commerce platforms only.',
  'FINTECH|HEALTHCARE': 'NARROW: Health payments or insurance-tech only.',
  'FINTECH|RETAIL': 'NARROW: Embedded finance or BNPL only.',
  'TECHNOLOGY|MANUFACTURING': 'NARROW: Industry 4.0 / factory automation software only.',
  'TECHNOLOGY|LOGISTICS': 'NARROW: Logistics-tech — WMS, TMS, route optimisation only.',
  'FMCG|LOGISTICS': 'NARROW: Last-mile distribution alignment only.',
  'FMCG|HEALTHCARE': 'NARROW: Health FMCG — nutraceuticals, OTC products only.',
  'CHEMICALS|AGRICULTURE': 'NARROW: Agrochemicals only. Verify product category.',
  'MANUFACTURING|LOGISTICS': 'NARROW: Captive logistics for manufacturing output only.',
};

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT: getSectorCompatibility()
// ─────────────────────────────────────────────────────────────

export function getSectorCompatibility(
  sourceSector: string,
  targetSector: string,
): SectorRelation {
  const s = normalizeSector(sourceSector);
  const t = normalizeSector(targetSector);

  // Same sector — always compatible
  if (s === t) {
    return {
      level: 'COMPATIBLE',
      penalty: 0,
      reason: `${s}: Same-sector consolidation — capacity, capability, or client book acquisition.`,
    };
  }

  // Hard incompatible check (symmetric)
  if (isHardIncompatible(s, t)) {
    return {
      level: 'INCOMPATIBLE',
      penalty: 1.0,
      reason: `${s} → ${t}: No observed deal pattern in dataset. No plausible business synergy.`,
    };
  }

  // Compatible pair check (both directions)
  const compatReason = COMPATIBLE[`${s}|${t}`] ?? COMPATIBLE[`${t}|${s}`];
  if (compatReason) {
    return { level: 'COMPATIBLE', penalty: 0, reason: compatReason };
  }

  // Narrow pair check (both directions)
  const narrowReason = NARROW[`${s}|${t}`] ?? NARROW[`${t}|${s}`];
  if (narrowReason) {
    return { level: 'NARROW', penalty: 0.10, reason: narrowReason };
  }

  // Default: NARROW with higher penalty (not explicitly incompatible, no precedent)
  return {
    level: 'NARROW',
    penalty: 0.15,
    reason: `${s} → ${t}: No direct deal precedent. Verify specific use case before connecting.`,
  };
}

// ─────────────────────────────────────────────────────────────
// MATCH ARCHETYPES — labels for match cards
// ─────────────────────────────────────────────────────────────

export const MATCH_ARCHETYPES = {
  BOLT_ON: 'Same-sector bolt-on',
  LICENSE: 'Regulatory licence acquisition',
  CROSS_SECTOR: 'Cross-sector capability',
  VERTICAL: 'Vertical integration',
  TECH_ENABLER: 'Technology enablement',
  GEOGRAPHIC: 'Geographic expansion',
} as const;

// ─────────────────────────────────────────────────────────────
// INDUSTRY-FIRST HIERARCHY RESOLUTION
// Specific Industry → Serving-Sector Relationship → Coarse Sector → GENERAL Fallback
// ─────────────────────────────────────────────────────────────

export type MandateSpecificity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IndustryEntity {
  industry?: string | null;
  sector?: string | null;
  sectors?: string[] | null;
  serving_sectors?: string[] | null;
  mandate_specificity?: MandateSpecificity | null;
}

export interface IndustryCompatibilityResult {
  level: CompatibilityLevel;
  score: number;          // 0.0 to 1.0 (sub-score weight)
  penalty: number;
  reason: string;
  archetype: string;
  isSpecificIndustryMatch: boolean;
  isServingSectorMatch: boolean;
  isGeneralFallback: boolean;
}

export function inferMandateSpecificity(entity: IndustryEntity): MandateSpecificity {
  if (entity.mandate_specificity) return entity.mandate_specificity;
  const ind = (entity.industry ?? '').trim().toLowerCase();
  const genericNames = new Set(['general', 'mixed', 'other', 'services', 'manufacturing', 'technology', 'fmcg']);
  if (ind.length >= 4 && !genericNames.has(ind)) {
    return 'HIGH';
  }
  if (entity.serving_sectors && entity.serving_sectors.length > 0) {
    return 'MEDIUM';
  }
  if (entity.sector && !genericNames.has(entity.sector.toLowerCase())) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export type IndustryRelationshipLevel = 'EXACT' | 'RELATED' | 'STRATEGIC' | 'NONE';

export interface IndustryNicheEvaluation {
  level: IndustryRelationshipLevel;
  score: number;
  reason: string;
}

const OPERATIONAL_STOP_WORDS = new Set([
  'manufacturing', 'manufacturer', 'manufacturers', 'manufacture',
  'production', 'producing', 'producer',
  'engineering', 'engineer',
  'services', 'service',
  'solutions', 'solution',
  'products', 'product',
  'component', 'components', 'parts',
  'industry', 'industries', 'industrial',
  'company', 'companies',
  'business', 'businesses',
  'technologies', 'technology', 'tech',
  'enterprises', 'enterprise',
  'group', 'corp', 'corporation', 'ltd', 'limited', 'pvt', 'private',
  'plant', 'facility', 'facilities', 'unit', 'units', 'operations', 'operation',
  'and', 'the', 'for', 'with', 'in', 'of', 'to', 'a', 'an', 'at', 'by', 'from',
  'around', 'near', 'based', 'across', 'located', 'location',
  'pune', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad', 'gujarat', 'maharashtra', 'india',
]);

export function cleanCoreTokens(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(t => t.length > 2 && !OPERATIONAL_STOP_WORDS.has(t));
}

const NICHE_SYNONYMS: Record<string, string[]> = {
  ai: ['artificial intelligence', 'machine learning', 'data analytics', 'analytics', 'deep learning', 'nlp', 'generative ai', 'computer vision'],
  artificial_intelligence: ['ai', 'machine learning', 'data analytics', 'analytics'],
  data_analytics: ['ai', 'artificial intelligence', 'big data', 'bi', 'business intelligence', 'machine learning', 'data science'],
  analytics: ['ai', 'data analytics', 'data science', 'business intelligence'],
  saas: ['software', 'technology', 'cloud', 'b2b saas', 'enterprise software', 'app', 'platform'],
  fintech: ['nbfc', 'payments', 'lending', 'digital banking', 'insurtech', 'wealthtech', 'credit'],
  ev: ['electric vehicle', 'mobility', 'ev charging', 'battery', 'clean mobility', 'powertrain'],
  logistics: ['supply chain', 'warehousing', 'freight', '3pl', 'cold chain', 'transportation'],
  pharma: ['pharmaceuticals', 'api', 'formulations', 'biotech', 'clinical research', 'drug', 'medicines'],
  healthcare: ['hospitals', 'diagnostics', 'healthtech', 'medical devices', 'telemedicine', 'clinic'],
  chemicals: ['specialty chemicals', 'fine chemicals', 'polymers', 'petrochemicals', 'agrochem', 'agrochemicals', 'speciality chemicals', 'intermediates', 'resins', 'compounds', 'polymer'],
  electronics: ['pcb', 'printed circuit board', 'power electronics', 'ems', 'electronics manufacturing', 'semiconductor', 'microelectronics', 'smd', 'smt', 'embedded hardware', 'electronic components'],
  precision_engineering: ['cnc', 'machining', 'tooling', 'die casting', 'forging', 'casting', 'valves', 'pumps', 'gears', 'fasteners', 'precision components', 'flow control'],
  auto_components: ['auto ancillary', 'oem components', 'tier 1', 'tier 2', 'automotive parts', 'sheet metal'],
};

export function evaluateIndustryNicheRelationship(ind1: string, ind2: string): IndustryNicheEvaluation {
  const c1 = ind1.toLowerCase().trim();
  const c2 = ind2.toLowerCase().trim();
  if (c1 === c2) {
    return { level: 'EXACT', score: 1.0, reason: `${ind1}: Exact / identical industry niche.` };
  }

  const t1 = cleanCoreTokens(c1);
  const t2 = cleanCoreTokens(c2);

  // Check synonym / taxonomy groups first
  for (const [key, syns] of Object.entries(NICHE_SYNONYMS)) {
    const group = [key, key.replace(/_/g, ' '), ...syns];
    const match1 = group.some(s => c1.includes(s) || t1.includes(s));
    const match2 = group.some(s => c2.includes(s) || t2.includes(s));
    if (match1 && match2) {
      return { level: 'EXACT', score: 1.0, reason: `${ind1}: Aligned niche within ${key.replace(/_/g, ' ')}.` };
    }
  }

  // If no niche-specific tokens remain (only generic operational terms), cannot qualify as exact niche
  if (t1.length === 0 || t2.length === 0) {
    return { level: 'NONE', score: 0.0, reason: 'Insufficient niche-specific tokens for direct match.' };
  }

  // Token overlap on substantive niche words only
  const overlap = t1.filter(t => t2.includes(t));
  const uniqueTokens = new Set([...t1, ...t2]);
  const jaccard = overlap.length / uniqueTokens.size;

  if (jaccard >= 0.5 || (overlap.length >= 2 && overlap.length >= Math.min(t1.length, t2.length))) {
    return { level: 'EXACT', score: 1.0, reason: `${ind1}: Strong niche alignment on ${overlap.join(', ')}.` };
  }

  if (overlap.length >= 1) {
    return { level: 'RELATED', score: 0.80, reason: `${ind1}: Related niche with shared capability (${overlap.join(', ')}).` };
  }

  return { level: 'NONE', score: 0.0, reason: 'No core niche alignment.' };
}

export function checkIndustrySimilarity(ind1: string, ind2: string): boolean {
  if (!ind1 || !ind2) return false;
  const niche = evaluateIndustryNicheRelationship(ind1, ind2);
  return niche.level === 'EXACT' || niche.level === 'RELATED';
}

function checkServingSectorMatch(targetIndOrSector: string, servingSectors: string[]): boolean {
  if (!targetIndOrSector || !servingSectors || servingSectors.length === 0) return false;
  const targetClean = targetIndOrSector.toLowerCase().trim();
  const targetNorm = normalizeSector(targetIndOrSector);

  for (const s of servingSectors) {
    if (!s) continue;
    const sClean = s.toLowerCase().trim();
    if (sClean === targetClean) return true;
    if (sClean.includes(targetClean) || targetClean.includes(sClean)) return true;
    if (normalizeSector(s) === targetNorm && targetNorm !== 'GENERAL') return true;
    const niche = evaluateIndustryNicheRelationship(sClean, targetClean);
    if (niche.level === 'EXACT' || niche.level === 'RELATED') return true;
  }
  return false;
}

export function getIndustryCompatibility(
  ind1?: string | null,
  ind2?: string | null,
  sec1?: string | null,
  sec2?: string | null,
  specificity?: MandateSpecificity
): IndustryCompatibilityResult {
  return resolveIndustryCompatibility(
    { industry: ind1 ?? null, sector: sec1 ?? (ind1 ? normalizeSector(ind1) : null) },
    { industry: ind2 ?? null, sector: sec2 ?? (ind2 ? normalizeSector(ind2) : null) },
    specificity
  );
}

export function resolveIndustryCompatibility(
  source: IndustryEntity,
  candidate: IndustryEntity,
  specificity?: MandateSpecificity
): IndustryCompatibilityResult {
  const srcInd = source.industry?.trim() || null;
  const cndInd = candidate.industry?.trim() || null;

  const srcSector = source.sector ?? source.sectors?.[0] ?? (srcInd ? normalizeSector(srcInd) : null);
  const cndSector = candidate.sector ?? candidate.sectors?.[0] ?? (cndInd ? normalizeSector(cndInd) : null);

  const srcServing = source.serving_sectors || [];
  const cndServing = candidate.serving_sectors || [];

  const activeSpecificity = specificity ?? source.mandate_specificity ?? inferMandateSpecificity(source);

  // RULE: GENERAL must never override a non-empty specific industry
  const isSrcGeneral = (!srcInd || srcInd.toLowerCase() === 'general' || srcInd.toLowerCase() === 'mixed') &&
    (!srcSector || normalizeSector(srcSector) === 'GENERAL');
  const isCndGeneral = (!cndInd || cndInd.toLowerCase() === 'general' || cndInd.toLowerCase() === 'mixed') &&
    (!cndSector || normalizeSector(cndSector) === 'GENERAL');

  // ── Step 1: Specific Core Niche Match (Primary Identity) ─────────────────────
  if (srcInd && cndInd && !isSrcGeneral && !isCndGeneral) {
    const niche = evaluateIndustryNicheRelationship(srcInd, cndInd);
    if (niche.level === 'EXACT') {
      return {
        level: 'COMPATIBLE',
        score: 1.0,
        penalty: 0,
        reason: niche.reason,
        archetype: MATCH_ARCHETYPES.BOLT_ON,
        isSpecificIndustryMatch: true,
        isServingSectorMatch: false,
        isGeneralFallback: false,
      };
    }
    if (niche.level === 'RELATED') {
      return {
        level: 'COMPATIBLE',
        score: 0.80,
        penalty: 0,
        reason: niche.reason,
        archetype: MATCH_ARCHETYPES.BOLT_ON,
        isSpecificIndustryMatch: true,
        isServingSectorMatch: false,
        isGeneralFallback: false,
      };
    }
  }

  // ── Step 2: Serving-Sector Relationship (Supporting Strategic Signal) ──────
  // Serving-sector relationship is treated as a supporting signal, not an automatic 0.95 match.
  if (srcInd || srcSector) {
    const targetToCheck = srcInd || srcSector || '';
    if (checkServingSectorMatch(targetToCheck, cndServing)) {
      const isHigh = activeSpecificity === 'HIGH';
      return {
        level: isHigh ? 'NARROW' : 'COMPATIBLE',
        score: isHigh ? 0.40 : 0.65,
        penalty: isHigh ? 0.10 : 0.05,
        reason: `Candidate serves ${targetToCheck} industry (supporting strategic signal).`,
        archetype: MATCH_ARCHETYPES.TECH_ENABLER,
        isSpecificIndustryMatch: false,
        isServingSectorMatch: true,
        isGeneralFallback: false,
      };
    }
  }

  if (cndInd || cndSector) {
    const targetToCheck = cndInd || cndSector || '';
    if (checkServingSectorMatch(targetToCheck, srcServing)) {
      const isHigh = activeSpecificity === 'HIGH';
      return {
        level: isHigh ? 'NARROW' : 'COMPATIBLE',
        score: isHigh ? 0.40 : 0.65,
        penalty: isHigh ? 0.10 : 0.05,
        reason: `Source serves ${targetToCheck} industry (supporting strategic signal).`,
        archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
        isSpecificIndustryMatch: false,
        isServingSectorMatch: true,
        isGeneralFallback: false,
      };
    }
  }

  // ── Step 3: Coarse Sector Compatibility Fallback ────────────────────────────
  if (srcSector && cndSector && !isSrcGeneral && !isCndGeneral) {
    const coarseComp = getSectorCompatibility(srcSector, cndSector);

    if (coarseComp.level === 'INCOMPATIBLE') {
      return {
        level: 'INCOMPATIBLE',
        score: 0.0,
        penalty: 1.0,
        reason: coarseComp.reason,
        archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
        isSpecificIndustryMatch: false,
        isServingSectorMatch: false,
        isGeneralFallback: false,
      };
    }

    // HIGH Specificity: Coarse cross-sector compatibility is restricted to prevent false matches.
    // Principle: "Industry Similarity is not the same as Target Requirement Satisfaction."
    if (activeSpecificity === 'HIGH') {
      const isSameCoarseSector = normalizeSector(srcSector) === normalizeSector(cndSector);
      if (isSameCoarseSector) {
        // Both within same broad sector bucket (e.g. Manufacturing), but different specific target industries (e.g. PCB vs CNC turning).
        // Must NOT create a high-confidence primary match.
        return {
          level: 'NARROW',
          score: 0.10,
          penalty: 0.15,
          reason: `${srcSector}: Same coarse sector but does not satisfy target requirement (${srcInd || srcSector} vs ${cndInd || cndSector}).`,
          archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
          isSpecificIndustryMatch: false,
          isServingSectorMatch: false,
          isGeneralFallback: false,
        };
      }

      if (coarseComp.level === 'COMPATIBLE' && (!srcInd || !cndInd)) {
        // Curated strategic pair (e.g. EV ↔ Auto Ancillary) when specific industries are not conflicting
        return {
          level: 'NARROW',
          score: 0.35,
          penalty: 0.10,
          reason: coarseComp.reason,
          archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
          isSpecificIndustryMatch: false,
          isServingSectorMatch: false,
          isGeneralFallback: false,
        };
      }

      // Cross-sector NARROW (e.g. Manufacturing vs Pharma) for HIGH specificity → score 0.0
      return {
        level: 'NARROW',
        score: 0.0,
        penalty: 0.20,
        reason: `${srcSector} → ${cndSector}: Broad cross-sector match suppressed for HIGH-specificity mandate.`,
        archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
        isSpecificIndustryMatch: false,
        isServingSectorMatch: false,
        isGeneralFallback: false,
      };
    }

    // MEDIUM / LOW Specificity: Discovery-oriented matching enabled
    if (coarseComp.level === 'COMPATIBLE') {
      const score = (srcInd && cndInd && !checkIndustrySimilarity(srcInd, cndInd)) ? 0.85 : 1.0;
      return {
        level: 'COMPATIBLE',
        score,
        penalty: 0,
        reason: coarseComp.reason,
        archetype: MATCH_ARCHETYPES.BOLT_ON,
        isSpecificIndustryMatch: false,
        isServingSectorMatch: false,
        isGeneralFallback: false,
      };
    }

    // Coarse NARROW for MEDIUM / LOW
    return {
      level: 'NARROW',
      score: 0.45,
      penalty: coarseComp.penalty || 0.10,
      reason: coarseComp.reason,
      archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
      isSpecificIndustryMatch: false,
      isServingSectorMatch: false,
      isGeneralFallback: false,
    };
  }

  // ── Step 4: GENERAL / Unknown Fallback ──────────────────────────────────────
  if (activeSpecificity === 'HIGH') {
    return {
      level: 'NARROW',
      score: 0.0,
      penalty: 0.20,
      reason: 'Generic or unmapped industry context suppressed for HIGH-specificity mandate.',
      archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
      isSpecificIndustryMatch: false,
      isServingSectorMatch: false,
      isGeneralFallback: true,
    };
  }

  return {
    level: 'NARROW',
    score: 0.15,
    penalty: 0.15,
    reason: 'Generic or unmapped industry context (requires high semantic similarity).',
    archetype: MATCH_ARCHETYPES.CROSS_SECTOR,
    isSpecificIndustryMatch: false,
    isServingSectorMatch: false,
    isGeneralFallback: true,
  };
}

// ─────────────────────────────────────────────────────────────
// FRAUD SIGNALS — HR-8 detection
// ─────────────────────────────────────────────────────────────

const FRAUD_SIGNAL_LIST = [
  'sblc', 'standby letter of credit', 'bank guarantee collateral',
  'bg discounting', 'guaranteed return', 'assured return',
  'risk-free return', 'guaranteed profit', 'fixed return on investment',
  'barclays collateral', 'hsbc instrument', 'fixed profit',
];

export function detectFraudSignals(text: string): string[] {
  const lower = text.toLowerCase();
  return FRAUD_SIGNAL_LIST.filter(s => lower.includes(s));
}
