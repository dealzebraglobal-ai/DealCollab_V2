/**
 * DealCollab — M5: Sector Compatibility Matrix
 * =============================================
 * Source: DC-KB-003 v1.0 — derived from 348 real Indian M&A transactions
 * Place at: src/lib/M5_sectorMatrix.ts
 *
 * Exports:
 *   normalizeSector()             — maps promptRouter SectorKeys → DC-KB-003 codes
 *   getSectorCompatibility()      — returns compatibility level + reason for any pair
 *   getIndustryCompatibility()    — full hierarchy (serving-sector, exact, rules, sector fallback)
 *   resolveIndustryCompatibility()— matchmakingEngine's single entrypoint: getIndustryCompatibility()
 *                                   enriched with a continuous 0..1 score, an archetype label, and
 *                                   isGeneralFallback (true when the result came from the generic
 *                                   "no direct deal precedent" branch rather than an explicit rule).
 *                                   This is the ONLY function the matchmaking engine should call —
 *                                   it does not invent new industry relationships, it only reads
 *                                   the matrix above through a richer return shape.
 *   MATCH_ARCHETYPES              — match type labels for match cards
 *   detectFraudSignals()          — HR-8 fraud signal detection
 */

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type CompatibilityLevel = 'COMPATIBLE' | 'NARROW' | 'INCOMPATIBLE';

export interface SectorRelation {
  level:   CompatibilityLevel;
  penalty: number;   // score deduction applied in calculateV2Score()
  reason:  string;   // shown on match card
}

// ─────────────────────────────────────────────────────────────
// SECTOR NORMALIZATION
// promptRouter lowercase keys → DC-KB-003 uppercase canonical codes
// ─────────────────────────────────────────────────────────────

const NORMALIZE_MAP: Record<string, string> = {
  pharma:        'PHARMACEUTICALS',
  pharmaceutical: 'PHARMACEUTICALS',
  pharmaceuticals: 'PHARMACEUTICALS',
  healthcare:    'HEALTHCARE',
  hospitals:     'HEALTHCARE',
  hospital:      'HEALTHCARE',
  manufacturing: 'MANUFACTURING',
  saas:          'TECHNOLOGY',
  software:      'TECHNOLOGY',
  technology:    'TECHNOLOGY',
  finserv:       'FINTECH',
  consumer:      'FMCG',
  fmcg:          'FMCG',
  realestate:    'REAL_ESTATE',
  'real estate': 'REAL_ESTATE',
  logistics:     'LOGISTICS',
  education:     'EDUCATION',
  chemicals:     'CHEMICALS',
  hospitality:   'HOTELS',
  hotels:        'HOTELS',
  renewable:     'RENEWABLE_ENERGY',
  'renewable energy': 'RENEWABLE_ENERGY',
  defence:       'DEFENCE',
  defense:       'DEFENCE',
  oil_gas:       'OIL_GAS',
  'oil & gas':   'OIL_GAS',
  ngo:           'NGO',
  mixed:         'GENERAL',
  // sub-sector overrides
  nbfc:          'NBFC',
  fintech:       'FINTECH',
  'auto ancillary': 'AUTO_ANCILLARY',
  ev:            'EV_MOBILITY',
  // specific product industries (must map to their proper sector category, NOT generic manufacturing!)
  toy:           'TOYS',
  toys:          'TOYS',
  fashion:       'FASHION',
  textiles:      'HOME_TEXTILES',
  'home textiles': 'HOME_TEXTILES',
  cybersecurity: 'CYBERSECURITY',
  'cyber security': 'CYBERSECURITY',
  'ot security': 'CYBERSECURITY',
  'sheet metal': 'SHEET_METAL_MANUFACTURING',
  'sheet metal manufacturing': 'SHEET_METAL_MANUFACTURING',
  'water treatment': 'WATER_TREATMENT',
  'water & wastewater': 'WATER_TREATMENT',
  'wastewater': 'WATER_TREATMENT',
  'wastewater treatment': 'WATER_TREATMENT',
  'effluent treatment': 'WATER_TREATMENT',
  'water recycling': 'WATER_TREATMENT',
  'environmental services': 'WATER_TREATMENT',
  etp: 'WATER_TREATMENT',
  stp: 'WATER_TREATMENT',
  zld: 'WATER_TREATMENT',
  ai:            'AI_DATA_ANALYTICS',
  'ai/ml':       'AI_DATA_ANALYTICS',
  'data analytics': 'AI_DATA_ANALYTICS',
  'artificial intelligence': 'AI_DATA_ANALYTICS',
  packaging:     'PACKAGING',
  'flexible packaging': 'PACKAGING',
  services:           'SERVICES',
  service:            'SERVICES',
  consulting:         'SERVICES',
  advisory:           'SERVICES',
  legal:              'SERVICES',
  accounting:         'SERVICES',
  tax:                'SERVICES',
  audit:              'SERVICES',
  recruitment:        'SERVICES',
  staffing:           'SERVICES',
  'digital marketing': 'SERVICES',
  'technology services': 'TECHNOLOGY',
  'tech services':    'TECHNOLOGY',
  'it services':      'TECHNOLOGY',
  'it consulting':    'TECHNOLOGY',
  'financial services': 'FINANCIAL_SERVICES',
  'financial advisory': 'FINANCIAL_SERVICES',
  'investment banking': 'FINANCIAL_SERVICES',
  'm&a':              'FINANCIAL_SERVICES',
  'm&a advisory':     'FINANCIAL_SERVICES',
  'private equity':   'FINANCIAL_SERVICES',
  'venture capital':  'FINANCIAL_SERVICES',
  'corporate finance': 'FINANCIAL_SERVICES',
  'debt advisory':    'FINANCIAL_SERVICES',
};

// Known explicit cross-industry compatibility rules
const INDUSTRY_COMPATIBILITY_RULES: Record<string, 'EXACT' | 'COMPATIBLE' | 'NARROW' | 'INCOMPATIBLE'> = {
  // Toys is compatible with Toys, Consumer Products, FMCG, Retail
  'TOYS|TOYS': 'EXACT',
  'TOYS|CONSUMER': 'COMPATIBLE',
  'TOYS|FMCG': 'COMPATIBLE',
  'TOYS|RETAIL': 'COMPATIBLE',
  'TOYS|SHEET_METAL_MANUFACTURING': 'INCOMPATIBLE',
  'SHEET_METAL_MANUFACTURING|TOYS': 'INCOMPATIBLE',
  'TOYS|DEFENCE': 'INCOMPATIBLE',
  'DEFENCE|TOYS': 'INCOMPATIBLE',
  'TOYS|PHARMACEUTICALS': 'INCOMPATIBLE',
  'PHARMACEUTICALS|TOYS': 'INCOMPATIBLE',

  // Fashion / Home Textiles
  'FASHION|FASHION': 'EXACT',
  'FASHION|HOME_TEXTILES': 'COMPATIBLE',
  'HOME_TEXTILES|HOME_TEXTILES': 'EXACT',
  'HOME_TEXTILES|FASHION': 'COMPATIBLE',
  'FASHION|SHEET_METAL_MANUFACTURING': 'INCOMPATIBLE',
  'HOME_TEXTILES|SHEET_METAL_MANUFACTURING': 'INCOMPATIBLE',

  // Cybersecurity
  'CYBERSECURITY|CYBERSECURITY': 'EXACT',
  'CYBERSECURITY|TECHNOLOGY': 'COMPATIBLE',
  'CYBERSECURITY|DEFENCE': 'COMPATIBLE',
  'CYBERSECURITY|SHEET_METAL_MANUFACTURING': 'INCOMPATIBLE',

  // AI & Data Analytics
  'AI_DATA_ANALYTICS|AI_DATA_ANALYTICS': 'EXACT',
  'AI_DATA_ANALYTICS|TECHNOLOGY': 'COMPATIBLE',
  'AI_DATA_ANALYTICS|SAAS': 'COMPATIBLE',
  'AI_DATA_ANALYTICS|FINTECH': 'COMPATIBLE',
  'AI_DATA_ANALYTICS|HEALTHCARE': 'COMPATIBLE',
  'AI_DATA_ANALYTICS|MANUFACTURING': 'INCOMPATIBLE',
  'AI_DATA_ANALYTICS|SHEET_METAL_MANUFACTURING': 'INCOMPATIBLE',
  'AI_DATA_ANALYTICS|REAL_ESTATE': 'INCOMPATIBLE',
  'AI_DATA_ANALYTICS|HOTELS': 'INCOMPATIBLE',
  'AI_DATA_ANALYTICS|OIL_GAS': 'INCOMPATIBLE',

  // Packaging
  'PACKAGING|PACKAGING': 'EXACT',
  'PACKAGING|PHARMACEUTICALS': 'COMPATIBLE',
  'PACKAGING|CONSUMER': 'COMPATIBLE',
  'PACKAGING|FMCG': 'COMPATIBLE',
  'PACKAGING|FOOD': 'COMPATIBLE',

  // Water Treatment & Wastewater Solutions
  'WATER_TREATMENT|WATER_TREATMENT': 'EXACT',
  'WATER_TREATMENT|PUMP_MANUFACTURING': 'COMPATIBLE',
  'WATER_TREATMENT|CHEMICALS': 'COMPATIBLE',
  'WATER_TREATMENT|SERVICES': 'COMPATIBLE',
  'WATER_TREATMENT|FINANCIAL_SERVICES': 'COMPATIBLE',
  'WATER_TREATMENT|FASHION': 'INCOMPATIBLE',
  'WATER_TREATMENT|TOYS': 'INCOMPATIBLE',
  'WATER_TREATMENT|HOTELS': 'INCOMPATIBLE',
  'WATER_TREATMENT|REAL_ESTATE': 'INCOMPATIBLE',

  // Pump & Fluid Handling Equipment
  'PUMP_MANUFACTURING|PUMP_MANUFACTURING': 'EXACT',
  'PUMP_MANUFACTURING|WATER_TREATMENT': 'COMPATIBLE',
  'PUMP_MANUFACTURING|MANUFACTURING': 'COMPATIBLE',
  'PUMP_MANUFACTURING|CHEMICALS': 'COMPATIBLE',
  'PUMP_MANUFACTURING|SERVICES': 'COMPATIBLE',
  'PUMP_MANUFACTURING|FINANCIAL_SERVICES': 'COMPATIBLE',
  'PUMP_MANUFACTURING|FASHION': 'INCOMPATIBLE',
  'PUMP_MANUFACTURING|TOYS': 'INCOMPATIBLE',
  'PUMP_MANUFACTURING|HOTELS': 'INCOMPATIBLE',
  'PUMP_MANUFACTURING|REAL_ESTATE': 'INCOMPATIBLE',
};

export function normalizeSector(raw: string): string {
  if (!raw) return 'GENERAL';
  const lower = raw.toLowerCase().trim();
  return NORMALIZE_MAP[lower] ?? raw.toUpperCase().replace(/[\s-]+/g, '_');
}

function normalizeIndustryKey(raw: string): string {
  if (!raw) return 'GENERAL';
  const lower = raw.toLowerCase().trim();
  if (NORMALIZE_MAP[lower]) return NORMALIZE_MAP[lower];

  // Specific high-precision product / tech industries first
  if (lower.includes('ai') || lower.includes('analytics') || lower.includes('machine learning') || lower.includes('data intelligence')) return 'AI_DATA_ANALYTICS';
  if (lower.includes('cyber') || lower.includes('security')) return 'CYBERSECURITY';
  if (lower.includes('toy')) return 'TOYS';
  if (lower.includes('sheet metal') || lower.includes('sheet_metal') || lower.includes('stamping')) return 'SHEET_METAL_MANUFACTURING';
  if (lower.includes('textile') || lower.includes('linen') || lower.includes('apparel') || lower.includes('garment')) return 'HOME_TEXTILES';
  if (lower.includes('fashion')) return 'FASHION';
  if (lower.includes('packaging')) return 'PACKAGING';
  if (lower.includes('m&a') || lower.includes('investment bank') || lower.includes('private equity') || lower.includes('venture capital') || lower.includes('debt advisory') || lower.includes('corporate finance')) return 'FINANCIAL_SERVICES';
  if (lower.includes('consult') || lower.includes('advisory') || lower.includes('legal') || lower.includes('accounting') || lower.includes('audit') || lower.includes('recruitment') || lower.includes('staffing') || lower.includes('tax')) return 'SERVICES';
  if (lower.includes('fintech') || lower.includes('nbfc') || lower.includes('lending') || lower.includes('banking')) return 'FINTECH';

  // Domain categories
  if (lower.includes('pharma') || lower.includes('formulation') || lower.includes('cdmo') || lower.includes('crams') || lower.includes('tablet') || lower.includes('capsule')) return 'PHARMACEUTICALS';
  if (lower.includes('hospital') || lower.includes('clinic') || lower.includes('diagnostic') || lower.includes('healthcare')) return 'HEALTHCARE';
  if (lower.includes('software') || lower.includes('saas') || lower.includes('cloud') || lower.includes('platform')) return 'TECHNOLOGY';
  
  // Specific equipment & engineering categories checked BEFORE generic manufacturing catch-all
  if (/water[\s-]?treatment/.test(lower) || lower.includes('wastewater') || lower.includes('effluent') ||
      lower.includes('water recycling') || lower.includes('water solution') || /\betp\b|\bstp\b|\bzld\b/.test(lower)) return 'WATER_TREATMENT';
  if (lower.includes('pump') || lower.includes('fluid handling') || lower.includes('valve') || lower.includes('flow control')) return 'PUMP_MANUFACTURING';
  if (lower.includes('machinery') || lower.includes('industrial') || lower.includes('manufacturing') || lower.includes('fabrication') || lower.includes('engineering')) return 'MANUFACTURING';
  if (lower.includes('real estate') || lower.includes('property') || lower.includes('infra') || lower.includes('builder')) return 'REAL_ESTATE';
  if (lower.includes('logistics') || lower.includes('warehouse') || lower.includes('cold chain') || lower.includes('freight')) return 'LOGISTICS';
  if (lower.includes('fmcg') || lower.includes('food') || lower.includes('beverage')) return 'FMCG';

  return normalizeSector(raw);
}

export function getIndustryCompatibility(
  sourceIndustry: string | null | undefined,
  candidateIndustry: string | null | undefined,
  sourceSector?: string | null,
  candidateSector?: string | null,
  sourceServingSectors?: string[] | null,
  candidateServingSectors?: string[] | null,
): SectorRelation {
  const sIndRaw = (sourceIndustry ?? '').trim();
  const cIndRaw = (candidateIndustry ?? '').trim();

  // 1. Check cross-sector capability (serving_sectors)
  const sourceCoreSector = sourceSector ? normalizeSector(sourceSector) : null;
  const candidateCoreSector = candidateSector ? normalizeSector(candidateSector) : null;
  const sourceServes = sourceServingSectors?.map(normalizeSector) || [];
  const candidateServes = candidateServingSectors?.map(normalizeSector) || [];

  if (sourceCoreSector && sourceCoreSector !== 'GENERAL' && candidateServes.includes(sourceCoreSector)) {
    return {
      level: 'COMPATIBLE',
      penalty: 0,
      reason: `Cross-sector capability: candidate explicitly manufactures for / serves the ${sourceSector} sector.`,
    };
  }
  if (candidateCoreSector && candidateCoreSector !== 'GENERAL' && sourceServes.includes(candidateCoreSector)) {
    return {
      level: 'COMPATIBLE',
      penalty: 0,
      reason: `Cross-sector capability: source explicitly manufactures for / serves the ${candidateSector} sector.`,
    };
  }

  // 2. Exact match on raw specific industry
  if (sIndRaw && cIndRaw && sIndRaw.toLowerCase() === cIndRaw.toLowerCase()) {
    return {
      level: 'COMPATIBLE',
      penalty: 0,
      reason: `Exact industry alignment: both operate in ${candidateIndustry || sourceIndustry}.`,
    };
  }

  // 3. Normalized specific industry checks
  const sNorm = sIndRaw ? normalizeIndustryKey(sIndRaw) : null;
  const cNorm = cIndRaw ? normalizeIndustryKey(cIndRaw) : null;

  if (sNorm && cNorm && sNorm === cNorm && sNorm !== 'GENERAL') {
    return {
      level: 'COMPATIBLE',
      penalty: 0,
      reason: `Exact category match: ${sNorm}.`,
    };
  }

  if (sNorm && cNorm) {
    const pairKey = `${sNorm}|${cNorm}`;
    const reverseKey = `${cNorm}|${sNorm}`;
    const rule = INDUSTRY_COMPATIBILITY_RULES[pairKey] || INDUSTRY_COMPATIBILITY_RULES[reverseKey];

    if (rule === 'INCOMPATIBLE') {
      return {
        level: 'INCOMPATIBLE',
        penalty: 1.0,
        reason: `Industry mismatch: ${sourceIndustry || sNorm} is incompatible with ${candidateIndustry || cNorm}.`,
      };
    }
    if (rule === 'EXACT' || rule === 'COMPATIBLE') {
      return {
        level: 'COMPATIBLE',
        penalty: 0,
        reason: `Aligned industry sector: ${sourceIndustry || sNorm} aligns with ${candidateIndustry || cNorm}.`,
      };
    }
  }

  // 4. Fallback to Coarse Sector (only if no conflicting specific industry rule triggered)
  // Hierarchy: specific industry -> serving-sector relationship -> coarse sector -> GENERAL only if nothing specific exists
  const rawSecA = sourceSector ? normalizeSector(sourceSector) : null;
  const rawSecB = candidateSector ? normalizeSector(candidateSector) : null;

  const effectiveSectorA = (sNorm && sNorm !== 'GENERAL')
    ? sNorm
    : ((rawSecA && rawSecA !== 'GENERAL') ? rawSecA : 'GENERAL');

  const effectiveSectorB = (cNorm && cNorm !== 'GENERAL')
    ? cNorm
    : ((rawSecB && rawSecB !== 'GENERAL') ? rawSecB : 'GENERAL');

  // Rule: GENERAL must never override a non-empty industry or be treated as exact industry match
  if (effectiveSectorA === 'GENERAL' && sIndRaw) {
    // Source has a specific industry, but sector was GENERAL/mixed
    if (cNorm && cNorm !== 'GENERAL' && isHardIncompatible(sNorm || sIndRaw, cNorm)) {
      return {
        level: 'INCOMPATIBLE',
        penalty: 1.0,
        reason: `Industry mismatch: ${sIndRaw} is incompatible with ${candidateIndustry || cNorm}.`,
      };
    }
  }

  return getSectorCompatibility(effectiveSectorA, effectiveSectorB);
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
  'CONSUMER|NBFC',
  'CONSUMER|DEFENCE',
  'CONSUMER|PHARMACEUTICALS',
  'EDUCATION|LOGISTICS',
  'EDUCATION|CHEMICALS',
  'REAL_ESTATE|LOGISTICS',
  'DEFENCE|RETAIL',
  'DEFENCE|FMCG',
  'DEFENCE|CONSUMER',
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
  'WATER_TREATMENT|CHEMICALS': 'Industrial water treatment and effluent management for chemical / process manufacturing.',
  'CHEMICALS|WATER_TREATMENT': 'Industrial water treatment and effluent management for chemical / process manufacturing.',
  'WATER_TREATMENT|PUMP_MANUFACTURING': 'Pump and fluid-handling equipment integration for water treatment systems.',
  'PUMP_MANUFACTURING|WATER_TREATMENT': 'Pump and fluid-handling equipment integration for water treatment systems.',
  'PUMP_MANUFACTURING|MANUFACTURING': 'Industrial pump and fluid-handling equipment manufacturing consolidation.',
  'MANUFACTURING|PUMP_MANUFACTURING': 'Industrial pump and fluid-handling equipment manufacturing consolidation.',
  'WATER_TREATMENT|SERVICES': 'Environmental engineering, ETP/STP compliance, or wastewater consultancy services.',
  'SERVICES|WATER_TREATMENT': 'Specialised environmental engineering, ETP/STP compliance, or water consultancy services.',
  'WATER_TREATMENT|FINANCIAL_SERVICES': 'Water infrastructure project finance, M&A advisory, or sustainability capital.',
  'FINANCIAL_SERVICES|WATER_TREATMENT': 'M&A advisory or capital raise for industrial wastewater / environmental business.',
  'TECHNOLOGY|AUTO_ANCILLARY':      'Tech closes hardware-software gap. Factory automation requires software intelligence layer. 13 deals observed.',
  'AUTO_ANCILLARY|TECHNOLOGY':      'Auto component maker adds digital layer for Industry 4.0 OEM requirements. 6 deals observed.',
  'MANUFACTURING|AUTO_ANCILLARY':   'OEM supply consolidation — same clients, adjacent component. 7 deals observed.',
  'AUTO_ANCILLARY|MANUFACTURING':   'Tier-1 acquires Tier-2 supplier. Same OEM relationships, adjacent capability.',
  'AUTO_ANCILLARY|EV_MOBILITY':     'Auto component maker transitions to EV-compatible parts. Platform changeover thesis.',
  'EV_MOBILITY|AUTO_ANCILLARY':     'EV platform acquires component capability — vertical integration of supply chain.',
  'MANUFACTURING|EV_MOBILITY':      'Industrial manufacturer adds EV capability for fleet and energy clients.',
  'EV_MOBILITY|MANUFACTURING':      'EV company acquires manufacturing capacity for scale-up.',
  'EV_MOBILITY|RENEWABLE_ENERGY':   'EV + renewable — charging infrastructure powered by clean energy.',
  'RENEWABLE_ENERGY|EV_MOBILITY':   'Renewable energy company adds EV charging as downstream application.',
  'TECHNOLOGY|NBFC':                'Fintech acquires RBI NBFC licence — regulatory shortcut. Fresh licence 18–24 months. 5 deals.',
  'NBFC|FINTECH':                   'NBFC adds fintech platform for digital loan distribution.',
  'FINTECH|NBFC':                   'Fintech acquires lending licence to activate embedded finance.',
  'TECHNOLOGY|FINTECH':             'Tech-adjacent — software + financial services integration.',
  'FINTECH|TECHNOLOGY':             'Fintech acquires tech platform to power digital lending or payments.',
  'TECHNOLOGY|PHARMACEUTICALS':     'Pharma software — clinical trials, regulatory submissions, QMS. 5 deals.',
  'TECHNOLOGY|HEALTHCARE':          'Digital health — telemedicine, diagnostic AI, hospital management systems.',
  'HEALTHCARE|TECHNOLOGY':          'Healthcare business acquires digital health platform.',
  'PHARMACEUTICALS|HEALTHCARE':     'Pharma conglomerate expands into hospital/diagnostic network.',
  'HEALTHCARE|PHARMACEUTICALS':     'Hospital chain acquires pharma supply — backward integration.',
  'MANUFACTURING|RENEWABLE_ENERGY': 'Industrial manufacturer adds renewable capability for existing client energy needs. 3 deals.',
  'MANUFACTURING|CHEMICALS':        'Chemical inputs supplier acquired by manufacturer — backward integration.',
  'CHEMICALS|MANUFACTURING':        'Chemical company acquires manufacturing capacity.',
  'CHEMICALS|PHARMACEUTICALS':      'Chemical intermediate supplier acquires downstream pharma. 2 deals.',
  'PHARMACEUTICALS|CHEMICALS':      'Pharma acquires chemical feedstock for supply chain security.',
  'CHEMICALS|HEALTHCARE':           'Medical consumables or diagnostics chemicals adjacency.',
  'FMCG|MANUFACTURING':             'FMCG brand acquires manufacturing for in-house production. 2 deals.',
  'MANUFACTURING|FMCG':             'Manufacturer acquires FMCG brand for B2C market access.',
  'FMCG|RETAIL':                    'FMCG brand acquires retail distribution — channel expansion.',
  'RETAIL|FMCG':                    'Retail chain acquires FMCG brand to create private label portfolio.',
  'CONSUMER|MANUFACTURING':             'Consumer brand acquires manufacturing for in-house production. 2 deals.',
  'MANUFACTURING|CONSUMER':             'Manufacturer acquires consumer brand for B2C market access.',
  'CONSUMER|RETAIL':                    'Consumer brand acquires retail distribution — channel expansion.',
  'RETAIL|CONSUMER':                    'Retail chain acquires consumer brand to create private label portfolio.',
  'REAL_ESTATE|HOTELS':             'Real estate developer acquires hospitality asset.',
  'HOTELS|REAL_ESTATE':             'Hotel chain acquires property for flagship asset ownership.',
  'TECHNOLOGY|EDUCATION':           'Edtech — software platform serving education institutions.',
  'EDUCATION|TECHNOLOGY':           'Education institution acquires edtech for digital delivery.',
  'FINANCIAL_SERVICES|NBFC':        'Financial services firm acquires NBFC for lending product.',
  'FINANCIAL_SERVICES|FINTECH':     'Wealth management adds fintech platform.',
  'AUTO_ANCILLARY|DEFENCE':         'Precision engineering capabilities dual-use for defence components.',
  'DEFENCE|MANUFACTURING':          'Defence OEM acquires manufacturing capacity.',
  'MANUFACTURING|DEFENCE':          'Manufacturer adds defence vertical — government contract diversification.',
  // Services & Financial Services Adjacencies (Industry <-> Service, Service <-> Service)
  'SERVICES|SERVICES':              'Professional services consolidation or practice acquisition.',
  'FINANCIAL_SERVICES|FINANCIAL_SERVICES': 'Financial services / advisory firm consolidation.',
  'FINANCIAL_SERVICES|SERVICES':    'Advisory firm expands into multidisciplinary professional services.',
  'SERVICES|FINANCIAL_SERVICES':    'Professional services firm adds M&A / financial advisory practice.',
  'SERVICES|MANUFACTURING':         'Industrial / technical services partnering with manufacturing company.',
  'MANUFACTURING|SERVICES':         'Manufacturer engages industrial consulting, design, or engineering services.',
  'SERVICES|TECHNOLOGY':            'Technology consulting, system integration, and professional services.',
  'TECHNOLOGY|SERVICES':            'Software firm partners with tech consulting / implementation provider.',
  'SERVICES|HEALTHCARE':            'Healthcare consulting, clinical audit, or operational services.',
  'HEALTHCARE|SERVICES':            'Hospital or clinic network engages specialized healthcare advisory services.',
  'SERVICES|PHARMACEUTICALS':       'Pharma regulatory, clinical trials, or validation advisory services.',
  'PHARMACEUTICALS|SERVICES':       'Pharmaceutical company engages regulatory / compliance consulting services.',
  'SERVICES|FMCG':                  'FMCG market entry, branding, or supply chain consulting services.',
  'FMCG|SERVICES':                  'Consumer brand partners with specialist marketing / supply chain advisory.',
  'SERVICES|LOGISTICS':             'Logistics management, 3PL/4PL consulting, or supply chain services.',
  'LOGISTICS|SERVICES':             'Logistics operator engages supply chain optimization advisory services.',
  'FINANCIAL_SERVICES|MANUFACTURING': 'M&A advisory, investment banking, or capital structuring for manufacturer.',
  'MANUFACTURING|FINANCIAL_SERVICES': 'Manufacturing firm seeking financial sponsor, M&A advisor, or debt advisory.',
  'FINANCIAL_SERVICES|TECHNOLOGY':  'Fintech / software investment banking, fundraising, or strategic advisory.',
  'TECHNOLOGY|FINANCIAL_SERVICES':  'Tech founder seeking growth capital advisory, venture funding, or M&A advisor.',
  'FINANCIAL_SERVICES|HEALTHCARE':  'Healthcare investment, buyout advisory, or clinical debt financing.',
  'HEALTHCARE|FINANCIAL_SERVICES':  'Healthcare group seeking capital expansion or financial advisor.',
  'FINANCIAL_SERVICES|PHARMACEUTICALS': 'Pharma M&A advisory, cross-border licensing, or transaction advisory.',
  'PHARMACEUTICALS|FINANCIAL_SERVICES': 'Pharma company seeking acquisition financing or M&A advisor.',
  'FINANCIAL_SERVICES|FMCG':        'FMCG private equity, strategic brand acquisition, or fundraising advisory.',
  'FMCG|FINANCIAL_SERVICES':        'Consumer brand seeking strategic investor or financial advisor.',
};

// ─────────────────────────────────────────────────────────────
// NARROW PAIRS — conditional compatibility (-10 score penalty)
// ─────────────────────────────────────────────────────────────

const NARROW: Record<string, string> = {
  'LOGISTICS|PHARMACEUTICALS':      'NARROW: Pharma-grade cold chain logistics only. Verify certification.',
  'LOGISTICS|HEALTHCARE':           'NARROW: Medical supply chain only. Verify temperature-controlled capability.',
  'LOGISTICS|FMCG':                 'NARROW: FMCG last-mile delivery. Verify route density.',
  'LOGISTICS|CONSUMER':             'NARROW: Consumer goods last-mile delivery. Verify route density.',
  'LOGISTICS|MANUFACTURING':        'NARROW: Industrial logistics only. Verify captive client or MSA contracts.',
  'MANUFACTURING|PHARMACEUTICALS':  'NARROW: Contract manufacturing or packaging only.',
  'PHARMACEUTICALS|MANUFACTURING':  'NARROW: Pharma packaging or equipment supplier only.',
  'HEALTHCARE|LOGISTICS':           'NARROW: Medical supply logistics only.',
  'HEALTHCARE|TECHNOLOGY':          'NARROW: Healthtech platforms only — telemedicine, diagnostic AI.',
  'AUTO_ANCILLARY|NBFC':            'NARROW: Fleet finance or vehicle finance NBFC only.',
  'RETAIL|TECHNOLOGY':              'NARROW: Retail-tech — POS, inventory, e-commerce platforms only.',
  'FINTECH|HEALTHCARE':             'NARROW: Health payments or insurance-tech only.',
  'FINTECH|RETAIL':                 'NARROW: Embedded finance or BNPL only.',
  'TECHNOLOGY|MANUFACTURING':       'NARROW: Industry 4.0 / factory automation software only.',
  'TECHNOLOGY|LOGISTICS':           'NARROW: Logistics-tech — WMS, TMS, route optimisation only.',
  'FMCG|LOGISTICS':                 'NARROW: Last-mile distribution alignment only.',
  'FMCG|HEALTHCARE':                'NARROW: Health FMCG — nutraceuticals, OTC products only.',
  'CONSUMER|LOGISTICS':             'NARROW: Last-mile distribution alignment only.',
  'CONSUMER|HEALTHCARE':            'NARROW: Health consumer products — nutraceuticals, OTC products only.',
  'CHEMICALS|AGRICULTURE':          'NARROW: Agrochemicals only. Verify product category.',
  'MANUFACTURING|LOGISTICS':        'NARROW: Captive logistics for manufacturing output only.',
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
      level:   'COMPATIBLE',
      penalty: 0,
      reason:  `${s}: Same-sector consolidation — capacity, capability, or client book acquisition.`,
    };
  }

  // Hard incompatible check (symmetric)
  if (isHardIncompatible(s, t)) {
    return {
      level:   'INCOMPATIBLE',
      penalty: 1.0,
      reason:  `${s} → ${t}: No observed deal pattern in dataset. No plausible business synergy.`,
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
    level:   'NARROW',
    penalty: 0.15,
    reason:  `${s} → ${t}: No direct deal precedent. Verify specific use case before connecting.`,
  };
}

// ─────────────────────────────────────────────────────────────
// MATCH ARCHETYPES — labels for match cards
// ─────────────────────────────────────────────────────────────

export const MATCH_ARCHETYPES = {
  BOLT_ON:      'Same-sector bolt-on',
  LICENSE:      'Regulatory licence acquisition',
  CROSS_SECTOR: 'Cross-sector capability',
  VERTICAL:     'Vertical integration',
  TECH_ENABLER: 'Technology enablement',
  GEOGRAPHIC:   'Geographic expansion',
} as const;

// ─────────────────────────────────────────────────────────────
// resolveIndustryCompatibility() — single entrypoint for matchmakingEngine.ts
// ─────────────────────────────────────────────────────────────

export interface IndustryCompatibilityInput {
  industry?: string | null;
  sector?: string | null;
  sectors?: string[] | null;
  serving_sectors?: string[] | null;
}

export interface IndustryCompatibilityResult extends SectorRelation {
  /** Continuous 0..1 signal for the scoring engine (COMPATIBLE=1, NARROW=0.2–0.45, else 0). */
  score: number;
  /** Match-card archetype label, derived from the same reason the matrix already produced. */
  archetype: string;
  /**
   * True when this result fell through to a generic fallback (no explicit rule matched — either
   * the default "no direct deal precedent" NARROW branch, or a GENERAL/unknown coarse sector) as
   * opposed to a named rule in INDUSTRY_COMPATIBILITY_RULES / COMPATIBLE / NARROW / HARD_INCOMPATIBLE.
   * The scoring engine uses this to stop a strong semantic-similarity score alone from producing a
   * false-positive match when the matrix has no real opinion on the pair.
   */
  isGeneralFallback: boolean;
}

/**
 * Enriches getIndustryCompatibility() with the fields the matchmaking engine needs (score,
 * archetype, isGeneralFallback) without changing the underlying decision — the matrix above
 * remains the only source of truth for what is/isn't compatible. Accepts either a `sector`
 * string or a `sectors[]` array (candidates from match_proposals return sectors as an array).
 */
export function resolveIndustryCompatibility(
  source: IndustryCompatibilityInput,
  candidate: IndustryCompatibilityInput,
): IndustryCompatibilityResult {
  const comp = getIndustryCompatibility(
    source.industry,
    candidate.industry,
    source.sector ?? source.sectors?.[0] ?? null,
    candidate.sector ?? candidate.sectors?.[0] ?? null,
    source.serving_sectors,
    candidate.serving_sectors,
  );

  // The generic fallback is the only NARROW branch with penalty 0.15 ("No direct deal precedent");
  // every named NARROW rule in the NARROW table above carries penalty 0.10. That's the reliable
  // signal — matching on reason text would break if a rule string changes.
  const genericNarrowFallback = comp.level === 'NARROW' && comp.penalty >= 0.15;

  // Two proposals that both resolve to the GENERAL coarse sector (source.sector === 'mixed' /
  // candidate.sectors === ['GENERAL'], etc.) hit getSectorCompatibility('GENERAL','GENERAL'),
  // which is COMPATIBLE via the "same sector" rule — correct when neither side states a specific
  // industry, but wrong when both DO state one and those industries are plainly different (e.g.
  // "Freshwater Aquaculture" vs "Unrelated Generic Business Services"). Only dampen when there's
  // stated industry evidence that the matrix's coarse-sector shortcut papered over.
  const sInd = (source.industry ?? '').trim().toLowerCase();
  const cInd = (candidate.industry ?? '').trim().toLowerCase();
  const statedIndustriesDiffer = sInd.length > 0 && cInd.length > 0 && sInd !== cInd;
  const genericSectorPair = comp.level === 'COMPATIBLE' && comp.reason.startsWith('GENERAL:') && statedIndustriesDiffer;

  const isGeneralFallback = genericNarrowFallback || genericSectorPair;

  let score: number;
  if (genericSectorPair) score = 0.2;
  else if (comp.level === 'COMPATIBLE') score = 1.0;
  else if (comp.level === 'NARROW') score = genericNarrowFallback ? 0.2 : 0.45;
  else score = 0;

  let archetype: string = MATCH_ARCHETYPES.CROSS_SECTOR;
  if (comp.reason.includes('Same-sector') || comp.reason.startsWith('Exact') || comp.reason.includes('Exact industry') || comp.reason.includes('Exact category')) {
    archetype = MATCH_ARCHETYPES.BOLT_ON;
  } else if (/licen[cs]e/i.test(comp.reason)) {
    archetype = MATCH_ARCHETYPES.LICENSE;
  } else if (comp.reason.includes('Vertical') || comp.reason.includes('backward integration') || comp.reason.includes('integration')) {
    archetype = MATCH_ARCHETYPES.VERTICAL;
  } else if (/software|tech|digital/i.test(comp.reason)) {
    archetype = MATCH_ARCHETYPES.TECH_ENABLER;
  } else if (comp.reason.includes('Cross-sector capability')) {
    archetype = MATCH_ARCHETYPES.CROSS_SECTOR;
  }

  return { ...comp, score, archetype, isGeneralFallback };
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