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
  healthcare:    'HEALTHCARE',
  manufacturing: 'MANUFACTURING',
  saas:          'TECHNOLOGY',
  finserv:       'FINTECH',
  consumer:      'FMCG',
  realestate:    'REAL_ESTATE',
  logistics:     'LOGISTICS',
  education:     'EDUCATION',
  chemicals:     'CHEMICALS',
  hospitality:   'HOTELS',
  renewable:     'RENEWABLE_ENERGY',
  defence:       'DEFENCE',
  oil_gas:       'OIL_GAS',
  ngo:           'NGO',
  mixed:         'GENERAL',
  // sub-sector overrides
  nbfc:          'NBFC',
  hospital:      'HEALTHCARE',
  fintech:       'FINTECH',
  'auto ancillary': 'AUTO_ANCILLARY',
  ev:            'EV_MOBILITY',
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
  'REAL_ESTATE|HOTELS':             'Real estate developer acquires hospitality asset.',
  'HOTELS|REAL_ESTATE':             'Hotel chain acquires property for flagship asset ownership.',
  'TECHNOLOGY|EDUCATION':           'Edtech — software platform serving education institutions.',
  'EDUCATION|TECHNOLOGY':           'Education institution acquires edtech for digital delivery.',
  'FINANCIAL_SERVICES|NBFC':        'Financial services firm acquires NBFC for lending product.',
  'FINANCIAL_SERVICES|FINTECH':     'Wealth management adds fintech platform.',
  'AUTO_ANCILLARY|DEFENCE':         'Precision engineering capabilities dual-use for defence components.',
  'DEFENCE|MANUFACTURING':          'Defence OEM acquires manufacturing capacity.',
  'MANUFACTURING|DEFENCE':          'Manufacturer adds defence vertical — government contract diversification.',
};

// ─────────────────────────────────────────────────────────────
// NARROW PAIRS — conditional compatibility (-10 score penalty)
// ─────────────────────────────────────────────────────────────

const NARROW: Record<string, string> = {
  'LOGISTICS|PHARMACEUTICALS':      'NARROW: Pharma-grade cold chain logistics only. Verify certification.',
  'LOGISTICS|HEALTHCARE':           'NARROW: Medical supply chain only. Verify temperature-controlled capability.',
  'LOGISTICS|FMCG':                 'NARROW: FMCG last-mile delivery. Verify route density.',
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