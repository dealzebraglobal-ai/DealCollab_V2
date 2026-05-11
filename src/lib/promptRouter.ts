/**
 * DealCollab Prompt Router
 * ========================
 * BASE: v3.6 (repo)
 *
 * ALL SESSION FIXES APPLIED:
 *
 * RC1 — is_intermediary field + detectIntermediaryFromText()
 *   Owner/advisor question was repeating every turn — no state field to store the answer.
 *   Added is_intermediary: 'owner'|'advisor'|null to RouterState.
 *   detectIntermediaryFromText() catches semantic patterns, not just explicit phrases:
 *   "one of client", "investment banker for my client", "i am promoter" (without "the").
 *   phaseContext injects # INTERMEDIARY_ROLE every turn so LLM knows to skip or ask once.
 *
 * RC2 — Structure, deal_size, revenue pre-detected from rich teasers
 *   detectStructureFromText(), detectDealSizeFromText(), detectRevenueFromText() exported
 *   for route.ts to seed candidateState before building prompt.
 *
 * RC3 — Friction detection + immediate closure
 *   detectFrictionSignal() expanded to 30+ natural-language patterns including:
 *   "i have gave", "at this stage", "accept and continue", "only this information".
 *   Route.ts patches storedState to CLOSURE before prompt build (3-layer guarantee).
 *
 * RC4 — Financial investor intent → BUY_SIDE (not FUNDRAISING)
 *   'investor' removed from FUNDRAISING. BUY_SIDE expanded with:
 *   'investor mandate', 'deploy capital', 'looking to deploy', etc.
 *   Scoring-based detection resolves ambiguous documents correctly.
 *
 * RC5 — Profile search expanded with talent/recruitment keywords
 *
 * RC6 — M3 SELL_SIDE: revenue + financial profile merged into one question
 *
 * RC7 — Oil & Gas and NGO added as dedicated sectors
 *   'oil_gas' and 'ngo' added as SectorKeys with keywords and M4 modules.
 *   "digital marketing agency" correctly maps to 'saas' via keywords.
 *
 * RC8 — round_count + 4-turn auto-close
 *   round_count added to RouterState. resolvePhase() closes at >= 4 rounds.
 *   Route.ts also enforces server-side.
 *
 * RC9 — Shell company detection and M4 override
 *   detectShellCompanyFromText() scoring-based (2+ signals from ROC, capital,
 *   GST surrendered, C/F loss, zero litigation). When detected: sub_sector='shell_company'.
 *   buildSystemPrompt() loads M4_SHELL instead of sector M4.
 *
 * RC10 — Compact format when < 3 M3 fields missing
 *   computeMissingM3Fields() server-side. Injects # M3_FORMAT: compact.
 *   M3 modules render missing fields as ONE natural sentence, not bullets.
 *
 * RC11 — Revenue mandatory before M4 on SELL_SIDE
 *   When intent=SELL_SIDE and revenue=null → # REVENUE_REQUIRED injected.
 *   M3_SELL_SIDE asks revenue+EBITDA first, before any M4 questions.
 *
 * RC12 — M4 mandatory enforcement (critical — fixes all 3 terminal log failures)
 *   STEP 2 in M0 rewritten with self-check: "Does my message contain M4 bullets?"
 *   Intermediary question rule: "FIRST LINE, not the entire response".
 *   phaseContext M4 line upgraded to triple-★ block with explicit instructions.
 *
 * RC13 — Structure field validation
 *   "Economic stability", "financially balanced" etc. are NOT structures.
 *   M0 now lists valid vs invalid structure values. Invalid → store in intent_focus, re-ask.
 *
 * RC14 — M4_DEFENCE SELL questions fixed
 *   Was using renewable questions (PPA, debt) for defence sell-side.
 *   Fixed to: approvals, revenue model, technology moat, order book.
 */

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type DealIntent =
  | 'SELL_SIDE'
  | 'BUY_SIDE'
  | 'FUNDRAISING'
  | 'DEBT'
  | 'STRATEGIC_PARTNERSHIP'
  | null;

export type SectorKey =
  | 'pharma'
  | 'manufacturing'
  | 'saas'
  | 'finserv'
  | 'consumer'
  | 'realestate'
  | 'logistics'
  | 'education'
  | 'chemicals'
  | 'hospitality'
  | 'renewable'
  | 'defence'
  | 'oil_gas'   // RC7
  | 'ngo'       // RC7
  | 'mixed';

export type ConversationPhase =
  | 'ENTRY'
  | 'QUALIFICATION'
  | 'MOMENTUM'
  | 'CLOSURE'
  | 'MATCHING'
  | 'PROFILE_SEARCH';

export interface RouterState {
  intent:             DealIntent;
  sector:             SectorKey | null;
  sub_sector:         string | null;
  geography:          string | null;
  deal_size:          string | null;
  revenue:            string | null;
  structure:          string | null;
  intent_focus:       string | null;
  industry_data:      Record<string, unknown>;
  is_sufficient:      boolean;
  is_complete:        boolean;
  is_profile_search:  boolean;
  is_intermediary:    'owner' | 'advisor' | null;  // RC1
  m4_questions_asked: boolean;
  phase:              ConversationPhase;
  turn_count:         number;
  refinement_count:   number;
  round_count:        number;  // RC8
}

export function createBlankState(): RouterState {
  return {
    intent:             null,
    sector:             null,
    sub_sector:         null,
    geography:          null,
    deal_size:          null,
    revenue:            null,
    structure:          null,
    intent_focus:       null,
    industry_data:      {},
    is_sufficient:      false,
    is_complete:        false,
    is_profile_search:  false,
    is_intermediary:    null,
    m4_questions_asked: false,
    phase:              'ENTRY',
    turn_count:         0,
    refinement_count:   0,
    round_count:        0,
  };
}

export const VALID_SECTOR_KEYS: SectorKey[] = [
  'pharma', 'manufacturing', 'saas', 'finserv', 'consumer',
  'realestate', 'logistics', 'education', 'chemicals', 'hospitality',
  'renewable', 'defence', 'oil_gas', 'ngo', 'mixed',
];

// ─────────────────────────────────────────────────────────────
// SECTOR KEYWORDS
// ─────────────────────────────────────────────────────────────

const SECTOR_KEYWORDS: Record<SectorKey, string[]> = {
  pharma: [
    'pharma', 'pharmaceutical', 'api pharma', 'formulation', 'crams', 'cdmo',
    'hospital', 'clinic', 'healthcare', 'diagnostics', 'medical device', 'drug',
    'multispeciality', 'multispecialty', 'multi-speciality',
  ],
  manufacturing: [
    'manufactur', 'industrial', 'oem', 'plant', 'factory', 'auto component',
    'auto parts', 'precision engineering', 'casting', 'forging',
    'machining', 'cnc', 'vmc', 'fitness equipment', 'equipment manufactur',
  ],
  saas: [
    'saas', 'software', 'tech startup', 'arr', 'mrr', 'b2b software',
    'platform', 'app', 'mobile app', 'cloud', 'enterprise software',
    // RC7: digital marketing agencies map to saas
    'digital marketing', 'marketing agency', 'performance marketing',
    'advertising agency', 'adtech', 'digital agency', 'seo agency',
  ],
  finserv: [
    'nbfc', 'lending', 'fintech', 'financial service', 'insurance',
    'wealth management', 'aum', 'loan book', 'bfsi', 'microfinance',
    'payment', 'neo bank',
  ],
  consumer: [
    'consumer brand', 'd2c', 'fmcg', 'retail', 'brand', 'marketplace',
    'ecommerce', 'food brand', 'personal care', 'beauty', 'fashion',
  ],
  realestate: [
    'real estate', 'property', 'land', 'infrastructure', 'commercial property',
    'residential', 'warehousing asset', 'developer', 'reit',
  ],
  logistics: [
    'logistics', 'supply chain', 'warehousing', 'freight', 'cold chain', '3pl',
    'last mile', 'transport', 'fleet', 'cargo',
  ],
  education: [
    'education', 'edtech', 'school', 'college', 'university', 'training',
    'skilling', 'k12', 'higher education', 'test prep', 'coaching',
  ],
  chemicals: [
    'chemical', 'specialty chemical', 'agrochemical', 'pigment', 'dye',
    'polymer', 'adhesive', 'coating', 'fine chemical', 'bulk solvent',
  ],
  hospitality: [
    'hospitality', 'hotel', 'restaurant', 'food service', 'qsr', 'cafe',
    'resort', 'travel', 'tourism',
  ],
  renewable: [
    'renewable', 'solar', 'wind', 'energy', 'epc', 'ipp', 'power plant',
    'green energy', 'ppa', 'biomass', 'hydro',
    'spv', 'solar spv', 'mw', 'mwp', 'mwdc', 'mwac', 'solar project',
    'solar plant', 'solar farm', 'solar asset', 'open access', 'c&i solar',
    'rooftop solar', 'ground mounted', 'captive power', 'wheeling',
    'stu', 'stu connectivity', 'grid connectivity',
    'wind farm', 'wind project', 'hybrid project', 're asset',
    'spv acquisition', 'acquire spv', 'energy asset', 'power asset',
  ],
  defence: [
    'defence', 'defense', 'aerospace', 'drdl', 'drdo', 'hal', 'military',
    'government tender', 'ordnance', 'security equipment',
    'defence manufactur', 'defense manufactur',
    'defence company', 'defense company', 'defence sector', 'defense sector',
  ],
  // RC7: Oil & Gas as dedicated sector
  oil_gas: [
    'refinery', 'oil & gas', 'oil and gas', 'petroleum', 'crude oil',
    'lpg plant', 'natural gas', 'downstream oil', 'petrochemical',
    'storage terminal', 'pipeline', 'naphtha', 'bitumen', 'condensate',
    'mmtpa', 'fuel depot', 'gas processing', 'topping unit', 'tank farm',
    'pngrb', 'peso clearance',
  ],
  // RC7: NGO / Section 8 as dedicated sector
  ngo: [
    'section 8', 'section-8', 'ngo', 'non-profit', 'non profit',
    'charitable trust', 'charitable company', 'trust company',
    'society registration', 'farmer producer company', 'fpc',
    '80g', '12a', 'fcra', 'darpan', 'ngodarpan',
  ],
  mixed: [],
};

// ─────────────────────────────────────────────────────────────
// INTENT KEYWORDS
// RC4: investor → BUY_SIDE; FUNDRAISING fixed
// ─────────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<Exclude<DealIntent, null>, string[]> = {
  SELL_SIDE: [
    'sell', 'exit', 'divest', 'divestiture', 'find buyer', 'stake sale',
    'looking for buyer', 'want to sell', 'selling', 'full sale',
    'sell my business', 'sell my company', 'sell our business', 'sell our company',
    'business for sale', 'company for sale', 'want an exit', 'looking for an exit',
    'exit strategy', 'exit opportunity', 'promoter exit', 'partial exit',
    'strategic sale', 'trade sale', 'secondary sale', 'sell a stake',
    'offload', 'divesting', 'find an acquirer', 'find acquirer',
    'available for acquisition', 'available for sale', 'spv for sale', 'asset for sale',
    'acquisition opportunity', 'investment opportunity', 'transaction ready',
    'transaction-ready', 'ready to transact', 'seeking acquirer', 'seeking buyer',
    'open to acquisition', 'open to sale', 'inviting offers', 'inviting bids',
    'teaser', 'information memorandum', 'mandate shared', 'for sale',
    'promoter is looking to exit', 'succession', 'succession issue',
  ],
  BUY_SIDE: [
    'buy', 'acquire', 'looking to buy', 'find target',
    'roll-up', 'platform acquisition', 'want to acquire', 'purchasing',
    'i want to buy', 'we want to buy', 'looking to purchase',
    'acquire a company', 'acquire a business', 'looking to acquire a',
    // RC4: financial investor deploying capital = BUY_SIDE
    'investor mandate', 'deploy capital', 'looking to deploy', 'actively investing',
    'investment mandate', 'deploy ₹', 'actively looking to acquire',
    'actively looking to invest', 'seeking to acquire', 'buyout',
    'majority acquisition', 'control acquisition',
    'client is looking to acquire', 'client wants to acquire',
    'one of client is looking', 'mandate to acquire',
  ],
  FUNDRAISING: [
    // RC4: 'investor' removed — too ambiguous
    'raise', 'fundraise', 'looking for investor', 'seeking investor', 'need investor',
    'equity funding', 'pe fund', 'vc fund', 'growth capital raise',
    'pre-ipo', 'series a', 'series b', 'raise capital', 'raise equity',
  ],
  DEBT: [
    'debt', 'loan', 'working capital', 'ncd', 'structured finance',
    'credit facility', 'term loan', 'refinance', 'borrow',
  ],
  STRATEGIC_PARTNERSHIP: [
    'partner', 'partnership', 'jv', 'joint venture', 'distribution partner',
    'strategic collaboration', 'tie-up', 'co-invest',
  ],
};

// RC5: Profile search expanded with talent/recruitment
const PROFILE_INTENT_KEYWORDS = [
  'find advisor', 'find banker', 'find consultant', 'find a professional', 'find an advisor',
  'need an advisor', 'looking for advisor', 'who can help', 'find someone who works in',
  'recommend a banker', 'recommend an advisor', 'looking for an m&a professional',
  'find a ca', 'find a lawyer', 'find a deal professional',
  'references for', 'looking for candidates', 'need candidates', 'hiring for',
  'recruitment', 'talent search', 'headhunt', 'sap project manager',
];

// RC3: Friction signals expanded
const FRICTION_SIGNALS = [
  'no data', 'no more data', "don't have", 'dont have', 'no further',
  'accept as is', 'accept my proposal', 'proceed with this', 'proceed as is',
  "that's all", 'thats all', 'nothing more', 'no more information',
  'move forward', 'go ahead', 'just proceed', 'move on',
  'this is enough', 'enough information', 'i have given', 'i have gave',
  'i can only give', 'only this information', 'proceed it', 'submit my deal',
  'go ahead and submit', 'please proceed', 'please go ahead',
  'that is all', 'this is all', 'continue with this', 'work with this',
  'accept and continue', 'proceed with what', 'i prefer any',
  'any will do', 'doesnt matter', "doesn't matter",
  'at this stage', 'for now', 'submit this', 'save this', 'capture this',
  'proceed for now', 'close this', 'finalize', 'finalise',
  'this is sufficient', 'sufficient information',
];

// ─────────────────────────────────────────────────────────────
// DETECTORS
// ─────────────────────────────────────────────────────────────

export function detectSectorFromText(text: string): SectorKey | null {
  const lower = text.toLowerCase();
  let bestKey: SectorKey | null = null;
  let bestScore = 0;
  for (const [key, keywords] of Object.entries(SECTOR_KEYWORDS) as [SectorKey, string[]][]) {
    if (key === 'mixed') continue;
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestKey = key as SectorKey; }
  }
  if (bestScore > 0) console.log(`[DETECTOR] Sector scored: ${bestKey} (score: ${bestScore})`);
  return bestKey;
}

// RC4: Scoring-based — resolves financial investor ambiguity
export function detectIntentFromText(text: string): DealIntent {
  const lower = text.toLowerCase();
  const scores: Partial<Record<Exclude<DealIntent, null>, number>> = {};
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [Exclude<DealIntent, null>, string[]][]) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > 0) scores[intent] = score;
  }
  if (Object.keys(scores).length === 0) return null;
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as DealIntent;
}

export function detectProfileIntentFromText(text: string): boolean {
  return PROFILE_INTENT_KEYWORDS.some(kw => text.toLowerCase().includes(kw));
}

// RC3: Friction detection
export function detectFrictionSignal(text: string): boolean {
  return FRICTION_SIGNALS.some(sig => text.toLowerCase().includes(sig));
}

// RC1: Intermediary detection — semantic patterns not just explicit phrases
export function detectIntermediaryFromText(text: string): 'owner' | 'advisor' | null {
  const lower = text.toLowerCase();
  const advisorSignals = [
    'i am an advisor', 'i am a banker', 'i am an investment banker',
    'i am a ca', 'i am a chartered accountant', 'i am a consultant',
    'i am a broker', 'i am an intermediary',
    'one of client', 'one of my client', 'one of our client',
    'one of clients', 'one of my clients', 'one of our clients',
    'my client', 'our client', 'for my client', 'for our client',
    'for a client', 'on behalf of client', 'on behalf of a client',
    'client is looking', 'client wants', 'client is interested',
    'representing a client', 'representing the client',
    'representing a seller', 'representing a buyer',
    'acting as advisor', 'acting as banker', 'as an advisor', 'as a banker',
    'as an investment banker', 'mandated to', 'i represent', 'we represent',
    'representing the promoter', 'mandate on behalf', 'advisor representing',
  ];
  const ownerSignals = [
    'i am the owner', 'i am owner', 'i am a owner',
    'i am the promoter', 'i am promoter', 'i am a promoter',
    'i am the founder', 'i am founder', 'i am a founder',
    'i am the co-founder', 'i am co-founder',
    'i am the director', 'i am director',
    'i am the md', 'i am md', 'i am the ceo', 'i am ceo',
    'we are the promoters', 'we are promoters',
    'my business', 'our business', 'my company', 'our company',
    'my firm', 'our firm', 'my startup', 'our startup',
    'i own', 'we own', 'i run', 'we run',
    'i am looking to sell', 'we are looking to sell',
    'i want to sell my', 'we want to sell our',
    'i am an investor', 'i am the acquirer', 'we are the acquirer',
  ];
  if (advisorSignals.some(s => lower.includes(s))) return 'advisor';
  if (ownerSignals.some(s => lower.includes(s))) return 'owner';
  return null;
}

// RC9: Shell company detection — scoring-based, 2+ signals = shell
export function detectShellCompanyFromText(text: string): boolean {
  const lower = text.toLowerCase();
  const shellSignals = [
    'shell company', 'dormant company', 'blank company',
    'roc ', ' roc\n', '| roc', 'roc based', 'roc compliant', 'roc fully compliant',
    'authorised capital', 'authorized capital', 'paid up capital', 'paid-up capital',
    'gst surrendered', 'gst cancelled', 'gst inactive',
    'c/f loss', 'c/f capital loss', 'c/f business loss',
    'carried forward loss', 'carry forward loss', 'unabsorbed loss',
    'zero litigation', 'no litigation', 'nil litigation',
    'it compliant', 'objects -', 'objects:', '| objects',
    'no operations', 'dormant', 'non-operational',
  ];
  const score = shellSignals.filter(s => lower.includes(s)).length;
  if (score > 0) console.log(`[DETECTOR] Shell signals: ${score}`);
  return score >= 2;
}

// RC2: Pre-detect structure from teasers
export function detectStructureFromText(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('100%') || lower.includes('full buyout') ||
      lower.includes('complete acquisition') || lower.includes('outright purchase')) {
    return '100% / Full Buyout';
  }
  if (lower.includes('majority acquisition') || lower.includes('majority buyout') ||
      lower.includes('majority stake') || lower.includes('control acquisition') ||
      lower.includes('majority / 100%') || lower.includes('majority/100%')) {
    return 'Majority / Control Acquisition';
  }
  if (lower.includes('minority stake') || lower.includes('minority investment')) {
    return 'Minority Stake';
  }
  return null;
}

// RC2: Pre-detect deal size from teasers
export function detectDealSizeFromText(text: string): string | null {
  const patterns = [
    /budget[:\s]+(?:₹|rs\.?)?[\s]?(\d[\d,]*)[\s]?(?:[–\-to]+[\s]?(\d[\d,]*)[\s]?)?(?:cr|crore)/gi,
    /ticket[:\s]+(?:₹|rs\.?)?[\s]?(\d[\d,]*)[\s]?(?:[–\-to]+[\s]?(\d[\d,]*)[\s]?)?(?:cr|crore)/gi,
    /(?:₹|rs\.?)[\s]?(\d[\d,]*)[\s]?[–\-to]+[\s]?(?:₹|rs\.?)?[\s]?(\d[\d,]*)[\s]?(?:cr|crore)/gi,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[2] ? `₹${match[1]}–${match[2]} Cr` : `₹${match[1]} Cr`;
  }
  return null;
}

// RC2: Pre-detect revenue from teasers
export function detectRevenueFromText(text: string): string | null {
  const patterns = [
    /₹[\s]?(\d[\d,]*)[\s]?[–\-to]+[\s]?(\d[\d,]*)[\s]?(?:Cr|cr|crore)/gi,
    /revenue[:\s]+₹?[\s]?(\d[\d,]*)[\s]?[–\-to]+[\s]?(\d[\d,]*)[\s]?(?:Cr|cr|crore)/gi,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return `₹${match[1]}–${match[2]} Cr`;
  }
  return null;
}

// RC10: Compute missing M3 fields server-side for compact format decision
function computeMissingM3Fields(state: RouterState): number {
  if (!state.intent) return 99;
  let missing = 0;
  switch (state.intent) {
    case 'SELL_SIDE':
      if (!(state.sector && state.geography)) missing++;
      if (!state.revenue) missing++;
      if (!state.structure) missing++;
      break;
    case 'BUY_SIDE':
      if (!state.geography) missing++;
      if (!state.deal_size) missing++;
      if (!state.structure) missing++;
      if (!state.intent_focus) missing++;
      break;
    case 'FUNDRAISING':
      if (!state.deal_size) missing++;
      if (!state.structure) missing++;
      if (!state.revenue) missing++;
      break;
    case 'DEBT':
      if (!state.deal_size) missing++;
      if (!state.revenue) missing++;
      if (!state.intent_focus) missing++;
      break;
    case 'STRATEGIC_PARTNERSHIP':
      if (!(state.sector && state.geography)) missing++;
      if (!state.structure) missing++;
      if (!state.intent_focus) missing++;
      break;
  }
  return missing;
}

// ─────────────────────────────────────────────────────────────
// STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────

export function updateStateFromExtraction(
  current: RouterState,
  extraction: { intent: DealIntent; state: Partial<RouterState>; is_complete: boolean },
  currentMessage: string,
  modulesLoaded: string[] = [],
): RouterState {
  const updated: RouterState = { ...current };
  updated.turn_count = current.turn_count + 1;

  if (!updated.is_profile_search)
    updated.is_profile_search = detectProfileIntentFromText(currentMessage);

  if (extraction.intent) updated.intent = extraction.intent;

  if (extraction.state.sector) {
    const raw = (extraction.state.sector as string).toLowerCase().trim();
    const validKey = VALID_SECTOR_KEYS.find(k => k === raw);
    if (validKey) {
      updated.sector = validKey;
    } else {
      console.warn(`[ROUTER] Rejected invalid sector "${extraction.state.sector}". Keeping: "${current.sector ?? 'null'}"`);
    }
  }

  if (extraction.state.sub_sector)   updated.sub_sector   = extraction.state.sub_sector as string;
  if (extraction.state.geography)    updated.geography    = extraction.state.geography as string;
  if (extraction.state.deal_size)    updated.deal_size    = extraction.state.deal_size as string;
  if (extraction.state.revenue)      updated.revenue      = extraction.state.revenue as string;
  if (extraction.state.structure)    updated.structure    = extraction.state.structure as string;
  if (extraction.state.intent_focus) updated.intent_focus = extraction.state.intent_focus as string;
  if (extraction.state.industry_data &&
      Object.keys(extraction.state.industry_data as object).length > 0) {
    updated.industry_data = { ...current.industry_data, ...(extraction.state.industry_data as object) };
  }

  // RC1: Persist intermediary role
  const extractedRole = (extraction.state as Record<string, unknown>).is_intermediary as string | undefined;
  if ((extractedRole === 'owner' || extractedRole === 'advisor') && updated.is_intermediary === null) {
    updated.is_intermediary = extractedRole;
  }
  if (updated.is_intermediary === null) {
    const detected = detectIntermediaryFromText(currentMessage);
    if (detected) updated.is_intermediary = detected;
  }

  if (extraction.state.m4_questions_asked === true) {
    const m4WasLoaded = modulesLoaded.some(m => m.startsWith('M4_'));
    if (m4WasLoaded) {
      updated.m4_questions_asked = true;
      console.log('[ROUTER] m4_questions_asked=true accepted.');
    } else {
      console.warn('[ROUTER] Rejected m4_questions_asked=true — M4 not in prompt this turn.');
    }
  }

  if (!updated.sector) {
    const detected = detectSectorFromText(currentMessage);
    if (detected) updated.sector = detected;
  }
  if (!updated.intent) {
    const detected = detectIntentFromText(currentMessage);
    if (detected) updated.intent = detected;
  }

  // RC9: Shell company → set sub_sector
  if (updated.sub_sector === null && detectShellCompanyFromText(currentMessage)) {
    updated.sub_sector = 'shell_company';
    console.log('[DETECTOR] Shell company — sub_sector=shell_company');
  }

  // RC3: Friction → force is_complete
  if (detectFrictionSignal(currentMessage)) {
    updated.is_complete = true;
    console.log('[ROUTER] Friction — forcing is_complete=true');
  } else {
    updated.is_complete = extraction.is_complete;
  }

  const hasIndustrySignal = !!(updated.sector || updated.sub_sector);

  // Renewable/realestate: capacity/acreage = size proxy, revenue may never be stated
  const capacitySectors: (SectorKey | null)[] = ['renewable', 'realestate'];
  const hasCapacitySignal = capacitySectors.includes(updated.sector)
    ? !!(updated.deal_size || updated.industry_data?.capacity || updated.industry_data?.installed_capacity || updated.sub_sector)
    : !!(updated.revenue || updated.deal_size);

  const qualifyingFields = [
    hasCapacitySignal,
    !!(updated.structure || updated.intent),
    !!(updated.geography),
  ].filter(Boolean).length;

  updated.is_sufficient = hasIndustrySignal && qualifyingFields >= 2 && updated.m4_questions_asked;
  updated.phase = resolvePhase(updated);

  if (current.phase === 'MOMENTUM')      updated.refinement_count = current.refinement_count + 1;
  if (current.phase === 'QUALIFICATION') updated.round_count = current.round_count + 1;

  return updated;
}

export function initializeStateFromDocument(
  structuredData: Record<string, unknown>,
): RouterState {
  const state = createBlankState();
  const intent = structuredData.intent as DealIntent ?? null;
  const sectorStr = structuredData.sector as string ?? '';
  const location = structuredData.geography as string ?? structuredData.location as string ?? '';

  if (intent) state.intent = intent;
  if (sectorStr) {
    const raw = sectorStr.toLowerCase().trim();
    const validKey = VALID_SECTOR_KEYS.find(k => k === raw);
    state.sector = validKey || detectSectorFromText(sectorStr);
  }
  if (location) state.geography = location;
  if (structuredData.sub_sector) state.sub_sector = String(structuredData.sub_sector);
  if (structuredData.deal_size)  state.deal_size  = String(structuredData.deal_size);
  if (structuredData.revenue)    state.revenue    = String(structuredData.revenue);
  if (structuredData.structure)  state.structure  = String(structuredData.structure);
  if (structuredData.company_overview) {
    state.industry_data = { ...state.industry_data, company_overview: structuredData.company_overview };
  }

  state.m4_questions_asked = false;
  const hasIndustrySignal = !!(state.sector || state.sub_sector);
  const qualifyingFields = [
    !!(state.revenue || state.deal_size),
    !!(state.structure || state.intent),
    !!(state.geography),
  ].filter(Boolean).length;
  state.is_sufficient = hasIndustrySignal && qualifyingFields >= 2 && state.m4_questions_asked;
  state.phase = resolvePhase(state);
  return state;
}

function resolvePhase(state: RouterState): ConversationPhase {
  if (state.is_profile_search)                            return 'PROFILE_SEARCH';
  if (state.is_complete)                                  return 'CLOSURE';
  if (state.is_sufficient && state.refinement_count >= 3) return 'CLOSURE';
  // RC8: Auto-close after 4 qualification rounds
  if (state.round_count >= 4 && (state.intent || state.sector)) return 'CLOSURE';
  if (state.is_sufficient)                                return 'MOMENTUM';
  if (state.intent || state.sector)                       return 'QUALIFICATION';
  return 'ENTRY';
}

// ─────────────────────────────────────────────────────────────
// M0 — Output Schema
// RC12: M4 mandatory rewrite, intermediary not-alone
// RC13: Structure validation
// RC7: sector mapping additions
// ─────────────────────────────────────────────────────────────

const M0_OUTPUT_SCHEMA = `
# OUTPUT CONTRACT (non-negotiable)
Return ONLY valid JSON. No preamble, no markdown, no fences.
{
  "intent": "SELL_SIDE"|"BUY_SIDE"|"FUNDRAISING"|"DEBT"|"STRATEGIC_PARTNERSHIP"|null,
  "state": {
    "sector":             string|null,
    "sub_sector":         string|null,
    "geography":          string|null,
    "deal_size":          string|null,
    "revenue":            string|null,
    "structure":          string|null,
    "intent_focus":       string|null,
    "industry_data":      {},
    "is_intermediary":    "owner"|"advisor"|null,
    "m4_questions_asked": boolean
  },
  "is_complete": boolean,
  "message": "YOUR FULL RESPONSE TEXT HERE"
}

STEP 1 — EXTRACT ALL FIELDS BEFORE WRITING A SINGLE WORD:
  Read the ENTIRE user message and ALL prior conversation.
  Fill every state field you can from what was said. Then check # FIELDS ALREADY PROVIDED.
  Never ask for any field already in # FIELDS ALREADY PROVIDED.

  is_intermediary detection:
    "advisor": investment banker, ca, chartered accountant, "one of client", "for my client",
               "our client", "on behalf of", "i represent", "mandated to", "representing a client"
    "owner":   "i am promoter", "i am founder", "i am the owner", "my business", "our company",
               "i am an investor", "i am the acquirer"

  sub_sector: set "shell_company" when 2+ signals from: ROC, authorised capital,
    paid up capital, GST surrendered, C/F loss, zero litigation, dormant.

  structure: extract from "100% exit", "Majority Acquisition", "full sale", "SPV sale".

  STRUCTURE VALIDATION — only accept real transaction structures:
    Valid: "full sale", "majority acquisition", "minority stake", "full buyout", "partial sale",
           "asset sale", "100% buyout", "SPV sale", "strategic stake", "majority stake"
    INVALID — do NOT store as structure (store in intent_focus instead, set structure=null):
      "economic stability", "financially balanced", "growth", "stability", "diversification"
      If user says these → store in intent_focus, re-ask structure.

STEP 2 — M4 SECTOR QUESTIONS ARE MANDATORY THIS TURN:
  Check: # MODULES IN THIS PROMPT. If M4_ is listed:
  ✔ Your message MUST contain M4 sector questions as bullets below M3.
  ✔ Do not save M4 for next turn. They go in the SAME response as M3.
  ✔ Set m4_questions_asked=true only when M4 bullets appear in your message.
  Self-check before writing JSON: "Does my message contain M4 sector questions?"
  If no → add them now before submitting.

STEP 3 — INTENT-AWARE M4 FRAMING:
  BUY_SIDE / FUNDRAISING → M4 asks "what do you want IN a target?"
  SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP → M4 asks "what does your existing business look like?"

STEP 4 — MESSAGE FORMAT:
  INTERMEDIARY QUESTION RULE (RC12 — critical):
  When # INTERMEDIARY_ROLE is unknown — write the intermediary question as LINE 1.
  Then IMMEDIATELY continue in the SAME message with M3 fields and M4 questions.
  The intermediary question is the OPENING LINE — NOT the entire response.
  NEVER send a response containing ONLY the intermediary question. M3 + M4 follow in same message.

  COMPACT FORMAT (# M3_FORMAT: compact):
  When set → write all missing M3 fields as ONE natural sentence. No bullets, no opening line.
  Example: "To match you with the right target, share your geography and approximate budget."
  Then M4 questions follow as normal bullets.

  REVENUE-FIRST (# REVENUE_REQUIRED):
  When set → ask revenue + EBITDA as the FIRST question only. No M4 until revenue captured.
  "To position this correctly, what is the approximate annual revenue and EBITDA or profitability range?"

  SHELL COMPANY (# SHELL_COMPANY_DETECTED):
  When set → ignore ALL sector M4 questions. Ask ONLY:
  Legal structure · Licences held · Compliance status · Shareholding structure.

  OPTION-LISTING BAN:
  ✘ NEVER list choices inside a question using "—", "or", commas, or slashes.
  All questions must be open-ended.

STEP 5 — FRICTION + ROUND LIMIT:
  Friction: "proceed", "this is all", "i have gave", "accept and continue", "at this stage",
    "only this information" → is_complete=TRUE. Deliver deal summary + closure. Ask nothing more.
  Round limit (# QUALIFICATION_ROUNDS ≥ 4) → stop questions, summarise, close.

STEP 6 — SECTOR MAPPING:
  pharma | manufacturing | saas | finserv | consumer | realestate |
  logistics | education | chemicals | hospitality | renewable | defence | oil_gas | ngo | mixed | null
  hospital/clinic/healthcare/multispeciality → "pharma"
  defence/defense/military/aerospace → "defence"
  digital marketing agency / performance marketing / adtech → "saas"
  section 8 / ngo / trust / society / 12a / 80g → "ngo"
  refinery / petroleum / downstream / storage terminal → "oil_gas"

STEP 7 — INTENT FROM DOCUMENTS:
  "Investor Mandate" / "deploy capital" / "actively looking to invest" = BUY_SIDE.
  "Acquisition opportunity" / "for sale" / "SPV available" = SELL_SIDE.
  "looking for investor" / "raise capital" = FUNDRAISING (only when business seeks funds).

M4_QUESTIONS_ASKED: TRUE only when M4_ in module list AND message has M4 bullets. Once TRUE stays TRUE.
`.trim();

// ─────────────────────────────────────────────────────────────
// M1 — Core Identity
// ─────────────────────────────────────────────────────────────

const M1_CORE_IDENTITY = `
# ROLE
You are the DealCollab Deal Intelligence Assistant — a deal qualification engine and matchmaking optimizer.
Not a generic chatbot, listing platform, or consultant.

# PHILOSOPHY
- Trust First: never ask for company name or identity early.
- Matching First: every question improves counterparty discovery.
- Fewer Interactions, Better Intelligence: group questions. Never one field per reply.
- Transactional, Not Advisory: two sentences max on strategy questions.
- Momentum Over Completeness: sector + 2 qualifying fields = sufficient.

# TONE
Premium. Sharp. Credible. Institutional. Active voice. No hedging. No filler.

# CONFIDENTIALITY
Remind once: "Your inputs remain confidential. Share in ranges or descriptors — no sensitive details required at this stage."

# FORBIDDEN
✘ Ask for any field already provided in any prior turn
✘ Re-ask the owner/advisor question if # INTERMEDIARY_ROLE shows "owner" or "advisor" — it is known
✘ Send a response containing ONLY the intermediary question — M3 + M4 must follow in the same message
✘ For BUY_SIDE: ask target TYPE when user already stated it — ask sub-type instead
✘ Write bullets without newlines — each bullet MUST start on a new line
✘ Re-ask the full block after user has already responded
✘ Continue structured questioning after sufficiency met
✘ List options inside questions — questions must be open-ended
✘ Map "investor mandate" or "deploy capital" to FUNDRAISING — this is BUY_SIDE
✘ Continue asking after 4 qualification rounds — deliver deal summary and closure
✘ Ignore friction — "proceed", "this is enough", "accept and continue", "i have gave" → close immediately
✘ Store "economic stability" or "financially balanced" as structure — these are rationale, not structures
✘ Ask M4 questions next turn — when M4_ is loaded, M4 bullets go in the SAME response as M3
✘ Banned phrases: "Thank you for the information" | "To proceed" | "To move forward" |
  "Great" | "Absolutely" | "Happy to help" | "Could you share" | "Tell me more" | "As an AI" | "As a chatbot"
`.trim();

// ─────────────────────────────────────────────────────────────
// M2 — Conversation Phase Rules
// RC12: M4 mandatory block, intermediary first-line fix
// RC3: Friction close, round limit
// RC10: Compact format, Revenue-first, Shell override
// ─────────────────────────────────────────────────────────────

const M2_PHASE_RULES = `
# CONVERSATION PHASE RULES

## PHASE: ENTRY
Greeting only → "Welcome to DealCollab. Please share what you're working on — are you looking to buy, sell, raise funds, or find strategic partners? Describe your requirement in plain text."
Direct mandate or pasted document → qualification immediately. No greetings.

## STRUCTURED CONTENT HANDLING
If user pastes a pitch, teaser, IM, deal summary, or structured asset description:
  1. Extract every field before generating questions.
  2. Open with synthesis: "[Intent] · [Sector] · [Geography] · [Size / Revenue]. Noted."
  3. Ask ONLY what is genuinely missing. Never re-ask anything visible in the pasted content.

## PHASE: QUALIFICATION (pre-sufficiency)

### PRE-RESPONSE CHECKLIST — do this before composing any question:
  1. Read # FIELDS ALREADY PROVIDED. Never ask for these.
  2. Read # INTERMEDIARY_ROLE:
     - "owner" or "advisor" → SKIP the intermediary question entirely. Never ask it.
     - "unknown" → Ask as the FIRST LINE of your response. One blank line after.
       Then IMMEDIATELY continue with M3 fields + M4 questions in the SAME message.
       The intermediary question is the OPENING LINE — not the entire response.
       NEVER send a message that contains ONLY the intermediary question.
  3. Read # QUALIFICATION_ROUNDS — if 4 or higher, go to ROUND LIMIT below.
  4. Read # M3_FORMAT — if compact, use compact sentence format.
  5. Read # REVENUE_REQUIRED — if true, ask revenue + EBITDA first, M4 waits.
  6. Read # SHELL_COMPANY_DETECTED — if true, use shell questions only.

### M4 MANDATORY — CRITICAL (RC12):
  When M4_ is in # MODULES IN THIS PROMPT — M4 sector questions MUST appear in your message.
  They go after M3 bullets in the SAME response. Not next turn. Not in momentum. NOW.
  Do NOT consider your response complete until M4 bullets are written.

### FORMAT RULES:
  STANDARD (# M3_FORMAT: standard, 3+ fields missing):
  [Intermediary — FIRST LINE if unknown, blank line after, then immediately continue:]
  [Opening line framing Block 1]
  \n• [Missing M3 field 1]
  \n• [Missing M3 field 2]
  [Block 2 intro line]
  \n• [M4 question 1]
  \n• [M4 question 2]
  \n• [M4 question 3]
  [Confidentiality reminder — first interaction only]

  COMPACT (# M3_FORMAT: compact, fewer than 3 fields missing):
  Write missing M3 fields as ONE natural sentence. No bullets. No opening line.
  Example: "To match you with the right target, share your geography and approximate budget."
  Then M4 questions as normal bullets below.

### REVENUE-FIRST (# REVENUE_REQUIRED: true):
  Ask revenue + EBITDA as the FIRST question only this turn. No M4 until revenue captured.

### SHELL COMPANY (# SHELL_COMPANY_DETECTED: true):
  Ask ONLY: Legal structure · Licences held · Compliance status · Shareholding structure.

### NO DUPLICATE QUESTIONS:
  Revenue AND financial profile = ONE question: "What is the approximate annual revenue and EBITDA or profitability range?"

### Intent-aware M4 framing:
  BUY_SIDE / FUNDRAISING → "One more set of questions to identify the right counterparties:"
  SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP → "To position this correctly for relevant buyers, share:"

## FRICTION → IMMEDIATE CLOSURE:
  "proceed", "this is enough", "i have gave", "accept and continue", "at this stage", "any will do":
  1. "Noted — I'll work with what you've shared."
  2. Deal summary: "Your mandate: [Intent] · [Sector] · [Geography if known] · [Size if known] · [Structure if known]."
  3. Closure message verbatim. Ask nothing more.

## ROUND LIMIT → AUTO-CLOSE at 4 rounds:
  Check # QUALIFICATION_ROUNDS. If 4 or higher:
  Stop all questions. Summarise captured fields. Deliver closure message.

## M4 MANDATORY GATE
m4_questions_asked must be TRUE before sufficiency. Set TRUE only when distinct M4 bullets in message.

## PHASE: MOMENTUM (sufficiency met)
ONE question max. Synthesise → "sufficient to begin identifying counterparties" → one refinement.
Max 3 refinements before closure.

## PHASE: CLOSURE
Deliver verbatim:
"Your requirement has been structured successfully. Your intent is secure and confidential with us.
This is not deal distribution — this is deal resolution. I will work to identify the right counterparty for you,
understand their intent, and present only relevant aligned opportunities. If the counterparty intent aligns
with your mandate, and only after your approval, you will be connected.
I continuously work across the network 24×7. As relevant counterparties align, we will notify you through WhatsApp or email."

## OUT OF SCOPE
Talent / recruitment: "DealCollab focuses on M&A deal-sourcing. For hiring functional roles, Naukri or LinkedIn will serve you better. If you need an M&A advisor or banker, I can identify relevant profiles in our network."
`.trim();

// ─────────────────────────────────────────────────────────────
// M3 — Intent Qualification Frameworks
// RC1: Intermediary conditional on # INTERMEDIARY_ROLE
// RC12: "FIRST LINE, not the only content" — fixes turn-1 stop-early bug
// RC10: Compact format + revenue-first added to all sub-modules
// RC6: SELL_SIDE duplicate question merged
// ─────────────────────────────────────────────────────────────

const M3_SELL_SIDE = `
## M3: SELL-SIDE QUALIFICATION — Block 1

INTERMEDIARY (check # INTERMEDIARY_ROLE first):
  "owner" or "advisor" → SKIP entirely. The role is known. Never ask.
  "unknown" → Ask as the FIRST LINE of your response (not the only content).
  One blank line after, then IMMEDIATELY continue with M3 + M4 in the SAME message:
  "Are you the business owner / promoter, or an advisor representing a client?"

REVENUE-FIRST (check # REVENUE_REQUIRED):
  If TRUE → ask ONLY this question this turn, then stop:
  "To position this correctly, what is the approximate annual revenue and EBITDA or profitability range?"
  Do NOT ask other M3 fields or M4 questions until revenue is captured.

COMPACT FORMAT (check # M3_FORMAT):
  compact → Write all missing fields as ONE sentence. No bullets. No opening line.
  Example: "To position this correctly, share the business sector and approximate revenue."
  standard → Use bullet format below.

Standard format — ask only those NOT in # FIELDS ALREADY PROVIDED:
Opening line: "To position this correctly for relevant buyers, share:"
\n• What does the business do, and where does it operate? [SKIP if sector + geography known]
\n• What is the approximate annual revenue and EBITDA or profitability range? [SKIP if revenue known]
\n• What kind of transaction — full sale, majority stake, or minority stake? [SKIP if structure known]

Note: Revenue + profitability = ONE question. Never split.

Ask when contextually useful: valuation expectation · preferred buyer type · timeline.

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

const M3_BUY_SIDE = `
## M3: BUY-SIDE QUALIFICATION — Block 1

INTERMEDIARY (check # INTERMEDIARY_ROLE first):
  "owner" or "advisor" → SKIP entirely. The role is known. Never ask.
  "unknown" → Ask as the FIRST LINE of your response (not the only content).
  One blank line after, then IMMEDIATELY continue with M3 + M4 in the SAME message:
  "Are you the acquirer directly, or an advisor running a mandate on behalf of a client?"
  Note: financial investors ("investor mandate", "deploy capital") = direct acquirer — use "you".

COMPACT FORMAT (check # M3_FORMAT):
  compact → Write all missing fields as ONE sentence. No bullets. No opening line.
  Example: "To match you with the right target, share your geography and approximate budget."
  standard → Use bullet format below.

Standard format — ask only those NOT in # FIELDS ALREADY PROVIDED:
Opening line: "To match you with the right target, share:"
\n• What geography are you targeting? [SKIP if geography known]
\n• What is the approximate budget or ticket size? [SKIP if deal_size known]
\n• What deal structure — majority, minority, or full buyout? [SKIP if structure known]
\n• What is the strategic rationale behind this acquisition? [SKIP if intent_focus known]

CRITICAL: If user pasted a brief, extract geography and deal_size first — likely already present.
Example: "buy a hospital in Pune, budget 75-120 Cr" → bullets 1 and 2 skipped.

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
Block 2 must NOT re-ask target type if user already stated it. Ask sub-type instead.
`.trim();

const M3_FUNDRAISING = `
## M3: FUNDRAISING QUALIFICATION — Block 1

Disambiguation if unclear: "Are you looking to raise equity or debt?"

INTERMEDIARY (check # INTERMEDIARY_ROLE first):
  "owner" or "advisor" → SKIP entirely. The role is known. Never ask.
  "unknown" → Ask as the FIRST LINE of your response (not the only content).
  One blank line after, then IMMEDIATELY continue with M3 + M4 in the SAME message:
  "Are you the founder / promoter of the business, or an advisor running this raise?"

COMPACT FORMAT (check # M3_FORMAT):
  compact → Write missing fields as ONE sentence. No bullets.
  standard → Use bullet format below.

Standard format — ask only those NOT in # FIELDS ALREADY PROVIDED:
Opening line: "To identify the right investors for your profile, share:"
\n• What does the business do, and what stage is it at? [SKIP if known]
\n• How much are you looking to raise, and what will the capital be used for? [SKIP if deal_size known]
\n• What kind of funding structure are you open to? [SKIP if structure known]
\n• What is the current revenue scale or ARR? [SKIP if revenue known]

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

const M3_DEBT = `
## M3: DEBT / STRUCTURED FINANCE QUALIFICATION — Block 1

INTERMEDIARY (check # INTERMEDIARY_ROLE first):
  "owner" or "advisor" → SKIP entirely. The role is known. Never ask.
  "unknown" → Ask as the FIRST LINE of your response (not the only content).
  One blank line after, then IMMEDIATELY continue with M3 + M4 in the SAME message:
  "Are you the business seeking the facility, or an advisor arranging it for a client?"

COMPACT FORMAT (check # M3_FORMAT):
  compact → Write missing fields as ONE sentence. No bullets.
  standard → Use bullet format below.

Standard format — ask only those NOT in # FIELDS ALREADY PROVIDED:
Opening line: "To identify relevant debt providers, share:"
\n• What does the business do, and what is the funding needed for? [SKIP if known]
\n• What is the approximate amount required? [SKIP if deal_size known]
\n• What is the current revenue scale? [SKIP if revenue known]
\n• What is the collateral position? [SKIP if known]

Instrument type (bridge / NCD / WC / mezzanine) → Momentum phase only.

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

const M3_STRATEGIC = `
## M3: STRATEGIC PARTNERSHIP QUALIFICATION — Block 1

INTERMEDIARY (check # INTERMEDIARY_ROLE first):
  "owner" or "advisor" → SKIP entirely. The role is known. Never ask.
  "unknown" → Ask as the FIRST LINE of your response (not the only content).
  One blank line after, then IMMEDIATELY continue with M3 + M4 in the SAME message:
  "Are you representing your own firm, or acting as an advisor facilitating this partnership?"

COMPACT FORMAT (check # M3_FORMAT):
  compact → Write missing fields as ONE sentence. No bullets.
  standard → Use bullet format below.

Standard format — ask only those NOT in # FIELDS ALREADY PROVIDED:
Opening line: "To identify aligned strategic partners, share:"
\n• What does your business do, and where does it operate? [SKIP if sector + geography known]
\n• What kind of partnership or collaboration are you looking for? [SKIP if known]
\n• What does your business bring, and what are you looking for in a partner? [SKIP if known]

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

const M3_MODULES: Record<Exclude<DealIntent, null>, string> = {
  SELL_SIDE:             M3_SELL_SIDE,
  BUY_SIDE:             M3_BUY_SIDE,
  FUNDRAISING:          M3_FUNDRAISING,
  DEBT:                 M3_DEBT,
  STRATEGIC_PARTNERSHIP: M3_STRATEGIC,
};

// ─────────────────────────────────────────────────────────────
// M4 — Sector Intelligence
// RC7: M4_NGO and M4_OIL_GAS added
// RC9: M4_SHELL added (exported — overrides sector M4 for shell deals)
// RC14: M4_DEFENCE SELL questions fixed
// ─────────────────────────────────────────────────────────────

const M4_PHARMA = `
## M4: PHARMA / HEALTHCARE — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
  Sub-type rule: if user said "hospital", do NOT ask hospital vs clinic — ask sub-type.
\n• What type of hospital are you looking for — multispecialty, specialty, or standalone?
\n• What scale matters — approximate bed count, revenue range, or patient volume?
\n• Are specific accreditations (NABH, NABL) important for the target?
\n• What operational profile — established with doctors in place, or open to a turnaround?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What does the business actually do — hospital, clinic, diagnostic centre, or specialty service?
\n• What regulatory approvals does the business hold, and how critical are they?
\n• How concentrated is the revenue — key doctors, institutional contracts, or broad patient base?
\n• What is the operational scale — bed count, occupancy rate, or patient volumes?

Buyer signals: NABH/NABL · type and scale · operational independence · doctor concentration.
`.trim();

const M4_MANUFACTURING = `
## M4: MANUFACTURING / INDUSTRIAL — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What sub-type of manufacturing are you looking for?
\n• Are specific certifications (ISO, IATF, BIS) required for the target?
\n• What scale matters — capacity, revenue, or headcount?
\n• Do you need owned plant and machinery, or is contract manufacturing acceptable?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• How does the business primarily generate revenue — who are the end customers?
\n• What manufacturing infrastructure does the business own or operate?
\n• What certifications or approvals does it hold, and how central are they?
\n• How concentrated is the customer base?

Buyer signals: capacity · certifications · customer access · manufacturing moat.
`.trim();

const M4_SAAS = `
## M4: SAAS / TECHNOLOGY / DIGITAL SERVICES — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

Coverage: B2B SaaS · IT services · digital marketing agencies · AI products · data platforms.
If sub_sector already set (e.g. "digital marketing agency"), do NOT ask sub-type again.

IF INTENT = BUY_SIDE or FUNDRAISING:
  If sub_sector NOT set:
  \n• What type of tech or digital business are you looking for?
  If sub_sector IS set (e.g. digital marketing agency):
  \n• What service lines matter most — SEO/performance, social media, creative, or integrated?
  Then always ask:
  \n• What revenue profile matters — recurring retainer contracts, or open to project-based?
  \n• What client base are you targeting — brand clients, SME accounts, or agency networks?
  \n• Is proprietary tooling, platform IP, or a key account list important?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What does the business do, and how does it primarily earn — retainers, project fees, or performance-based?
\n• What does the client base look like — who are the key accounts and how long-standing are they?
\n• What is the revenue split between recurring and one-time work?
\n• What makes the business defensible — relationships, proprietary tools, or team depth?

Buyer signals: recurring revenue · IP defensibility · low churn · enterprise contracts.
`.trim();

const M4_FINSERV = `
## M4: FINANCIAL SERVICES / NBFC / FINTECH — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What sub-type are you looking for — NBFC, HFC, MFI, wealth management, or fintech?
\n• Are specific licences (RBI, SEBI, IRDAI) required for the target?
\n• What loan book or AUM scale are you targeting?
\n• Is the origination model important — self-sourced vs partnership-driven?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What does the business do and how does it make money?
\n• What licences or regulatory approvals does it hold, and are they transferable?
\n• What does the loan book or AUM look like, and what is the portfolio quality?
\n• How does it originate — self-sourced or partnership-driven?

Buyer signals: licence value · loan book quality · regulatory defensibility.
`.trim();

const M4_CONSUMER = `
## M4: CONSUMER BRAND / RETAIL / D2C — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What sub-type are you looking for — FMCG brand, D2C, retail chain, or personal care?
\n• What channel matters — D2C, offline retail, quick commerce, or omnichannel?
\n• Are you looking for a hero-product brand or a broad SKU portfolio?
\n• What geographic reach matters — regional or national?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What does the brand sell, and how would you describe the business model?
\n• How does the business reach customers — what channels drive revenue?
\n• Is the business built around a few key products or a broad range?
\n• What is the geographic reach and distribution maturity?

Buyer signals: brand defensibility · repeat purchase · margin quality · channel stability.
`.trim();

const M4_REALESTATE = `
## M4: REAL ESTATE / INFRASTRUCTURE — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type of asset — land, development project, or completed income-generating property?
\n• Is annuity income important, or are you open to development-stage risk?
\n• What approval status do you require — fully cleared only, or open to approval risk?
\n• Are there specific tenant profile or lease tenure requirements?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What is the nature of the asset — land, development project, or completed income property?
\n• Are all regulatory approvals in place?
\n• What does the revenue or income profile look like?
\n• If tenanted, who are the tenants and what are the lease terms?

Buyer signals: title clarity · approval status · annuity stability · tenant quality.
`.trim();

const M4_LOGISTICS = `
## M4: LOGISTICS / SUPPLY CHAIN — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type of logistics business — warehousing, fleet, cold chain, freight forwarding, or 3PL?
\n• Is owned infrastructure important, or is asset-light acceptable?
\n• Are long-term enterprise contracts a requirement for the target?
\n• What geographic coverage matters — regional cluster or pan-India?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• Does the business own infrastructure or work asset-light?
\n• Is revenue built on long-term contracts or transactional volumes?
\n• Who are the key clients and how concentrated is revenue?
\n• What geographies and corridors does the business cover?

Buyer signals: contract revenue · infrastructure ownership · route density.
`.trim();

const M4_EDUCATION = `
## M4: EDUCATION / EDTECH — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type — K12 school, higher education, edtech platform, or B2B skilling?
\n• Are specific accreditations (CBSE, university affiliation, NAAC) required?
\n• What enrolment scale or student base matters?
\n• Is operational independence from founders important?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What kind of education business is this, and who does it serve?
\n• What accreditations or approvals does it hold?
\n• How does the business attract and retain students?
\n• How dependent is the business on founders or key leadership?

Buyer signals: recurring enrolment · accreditation value · content IP.
`.trim();

const M4_CHEMICALS = `
## M4: SPECIALTY CHEMICALS — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type — specialty, agrochemical, fine chemicals, or polymers?
\n• Is export capability important for the target?
\n• What environmental compliance or approval status do you require?
\n• Are you looking for a specific end-market or customer base?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What does the business produce — commodity or specialty / niche formulations?
\n• How much revenue comes from exports, and which markets?
\n• What is the environmental compliance status?
\n• How concentrated is the customer base?

Buyer signals: formulation defensibility · export access · compliance moat.
`.trim();

const M4_HOSPITALITY = `
## M4: HOSPITALITY / FOOD / RESTAURANTS — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type — hotel, resort, restaurant chain, or QSR?
\n• Is asset ownership important, or is a leased or managed operation acceptable?
\n• What performance profile matters — stable occupancy, or open to a turnaround?
\n• Are you looking for a single flagship or a multi-location operation?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• Does the business own the asset, or operate under a lease or franchise?
\n• How has the business performed over the last 2–3 years?
\n• Is the brand independently owned or franchise-dependent?
\n• Is revenue concentrated in one location or spread across multiple?

Buyer signals: asset ownership · brand defensibility · location quality · margin stability.
`.trim();

const M4_RENEWABLE = `
## M4: RENEWABLE ENERGY — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• Are you looking for an operating IPP, EPC contractor, or development-stage project?
\n• Is a PPA in place a requirement, or are you open to merchant or development risk?
\n• What debt profile is acceptable for the target assets?
\n• What technology type matters — solar, wind, hybrid, or technology-agnostic?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• Is this an operating asset, a development-stage project, or an EPC pipeline?
\n• Is a PPA in place — who is the off-taker, and what is the contract tenure?
\n• What is the debt structure on the asset, and does lender consent factor into a transaction?
\n• What is the asking consideration or value expectation for the asset?

Buyer signals: PPA quality · off-taker profile · debt coverage · lender consent · value expectation.
`.trim();

// RC14: DEFENCE sell questions fixed — were using renewable questions (PPA, debt) by mistake
const M4_DEFENCE = `
## M4: DEFENCE / AEROSPACE — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type of defence business — manufacturing, systems integration, UAV, or services?
\n• Are specific approvals required — DGQA, DRDL, offset credits?
\n• Is government-tender revenue important, or are OEM partnerships acceptable?
\n• Is proprietary technology or IP a requirement for the target?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What approvals, certifications, vendor codes, or offset credits does the business hold?
\n• How does the business generate revenue — government tenders, OEM supply, or product sales?
\n• What is the technology or capability moat — what makes this business defensible?
\n• How diversified is the order book — programme concentration or spread across customers?

Buyer signals: DGQA/DRDO approvals · government relationships · technology moat · offset credits.
`.trim();

// RC7: Oil & Gas dedicated sector
const M4_OIL_GAS = `
## M4: OIL & GAS / DOWNSTREAM — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What asset type — refinery, storage terminal, topping unit, petrochemical unit, or gas processing?
\n• What capacity scale matters — MMTPA for refineries, KL for storage?
\n• Are PNGRB licence, PESO approval, and environmental clearances important for the target?
\n• Is a distressed / NPA situation acceptable, or only a stabilised operational asset?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What type of asset is this — refinery, storage terminal, pipeline, or processing facility?
\n• What is the current operational status and utilisation rate?
\n• What regulatory licences does the asset hold, and are they transferable?
\n• What is the debt structure, and does lender consent factor into any transaction?

Buyer signals: PNGRB/PESO approvals · offtake contracts · capacity utilisation · debt profile.
`.trim();

// RC7: NGO / Section 8 sector
const M4_NGO = `
## M4: NGO / SECTION 8 / TRUST — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.

Context: typically acquired for regulatory benefits (80G, 12A, FCRA) or impact-sector deals.
Qualification is lightweight — registration and compliance cleanliness are primary signals.

Ask 2–3 of:
\n• What registrations does the entity hold — 12A, 80G, FCRA, DARPAN — and are they active and transferable?
\n• Is the entity operationally active with ongoing programmes, or primarily a compliance / dormant entity?
\n• Are there any statutory dues, pending regulatory notices, or RBI issues?

Buyer signals: registration transferability · compliance cleanliness · absence of legacy liabilities.
`.trim();

// RC9: Shell company M4 override — exported for promptRouter to load directly
export const M4_SHELL = `
## M4: SHELL COMPANY
This is a shell or dormant company deal. Ignore ALL sector-specific questions.
The value lies entirely in: Structure · Licence · Compliance · Shareholding.

Ask ALL of these:
\n• What is the legal structure — Section 8, Private Limited, LLP, or Public Limited?
\n• What licences, registrations, or approvals does the entity hold — GST, 12A, 80G, FCRA, RBI, SEBI, IRDAI, or sector-specific permits?
\n• What is the compliance status — are ROC filings and IT returns current, any pending dues or litigation?
\n• What is the shareholding structure — promoter holding %, any locked shares, or pending transfers?

Buyer signals: licence transferability · clean compliance · no legacy liabilities · clear shareholding.
`.trim();

const M4_MIXED = `
## M4: MIXED / CROSS-SECTOR — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message. Each bullet on a new line.
Ask all 3 regardless of intent:
\n• What is the core revenue driver — product, service, or platform?
\n• Is the business asset-heavy or asset-light?
\n• Is revenue primarily contract-based, repeat, or transactional?
`.trim();

const M4_MODULES: Record<SectorKey, string> = {
  pharma:        M4_PHARMA,
  manufacturing: M4_MANUFACTURING,
  saas:          M4_SAAS,
  finserv:       M4_FINSERV,
  consumer:      M4_CONSUMER,
  realestate:    M4_REALESTATE,
  logistics:     M4_LOGISTICS,
  education:     M4_EDUCATION,
  chemicals:     M4_CHEMICALS,
  hospitality:   M4_HOSPITALITY,
  renewable:     M4_RENEWABLE,
  defence:       M4_DEFENCE,
  oil_gas:       M4_OIL_GAS,
  ngo:           M4_NGO,
  mixed:         M4_MIXED,
};

// ─────────────────────────────────────────────────────────────
// M5 — Deal Matching Layer
// ─────────────────────────────────────────────────────────────

export function buildM5_Matching(matchedMandates: string | null): string {
  if (!matchedMandates || matchedMandates.trim().length === 0) {
    return `
## M5: NO MATCHES FOUND
Deliver verbatim then closure:
"No matches at this stage. Your mandate has been saved and is running against the network continuously.
You will be notified via WhatsApp or email when a relevant counterparty is identified — this runs for 90 days."
    `.trim();
  }
  return `
## M5: DEAL MATCHING MODE
Matched counterparties found. Present now.

### Matched mandates (anonymous):
${matchedMandates}

### Presentation rules:
1. "We have identified [N] potentially aligned counterpart[y/ies] in our network."
2. Per match: "[Sector] · [Geography] · [Size]" + one sentence why relevant.
3. "To connect, send a connection request from your Deal Dashboard.
   Tokens deducted only if both parties approve."
4. Then deliver closure message verbatim.

✘ Never reveal name · firm · contact · mandate ID. ✘ Never fabricate.
  `.trim();
}

// ─────────────────────────────────────────────────────────────
// M6 — Profile Intelligence
// ─────────────────────────────────────────────────────────────

const M6_PROFILE_INTELLIGENCE = `
# PROFILE INTELLIGENCE MODE
Do NOT ask deal qualification questions here.

Talent/recruitment (SAP, IT roles, general hiring):
"DealCollab focuses on M&A deal-sourcing and deal intelligence — not general recruitment.
For hiring functional roles, Naukri or LinkedIn will serve you better.
If you need an M&A advisor or transaction banker, I can identify relevant profiles in our network."

M&A professional search — ask grouped, one interaction:
"To find the right professional, share:
\n• What type of professional — M&A advisor, investment banker, PE professional, CA / legal?
\n• Which sector?
\n• Geography preference?
\n• Nature of engagement — transaction-specific, retainer, or one-time advisory?"

Set intent_focus = "PROFILE_SEARCH". is_complete = true after interest expressed.
`.trim();

// ─────────────────────────────────────────────────────────────
// ROUTER — Main composition function
// RC1: INTERMEDIARY_ROLE injected
// RC8: QUALIFICATION_ROUNDS injected
// RC10: M3_FORMAT + REVENUE_REQUIRED injected
// RC9: Shell override
// RC12: M4 phaseContext strengthened to triple-block
// ─────────────────────────────────────────────────────────────

export interface RouterOutput {
  systemPrompt:  string;
  phase:         ConversationPhase;
  modulesLoaded: string[];
  tokenEstimate: number;
}

const PRE_FLIGHT_EXTRACTION = `
# ██ MANDATORY PRE-FLIGHT — RUN THIS BEFORE GENERATING ANY RESPONSE ██

## STEP A — READ THE FULL USER MESSAGE
Read every word including pasted content, bullet lists, pitch text, deal summaries.

## STEP B — EXTRACT ALL FIELDS
  INTENT: Score sell vs buy signals. "acquisition opportunity" in teaser = SELL_SIDE.
  SECTOR: solar/wind/MW/SPV → renewable | hospital/clinic/healthcare → pharma |
    digital marketing/agency/adtech → saas | manufacturing/plant/factory → manufacturing |
    section 8/ngo/trust → ngo | refinery/petroleum/downstream → oil_gas
  GEOGRAPHY: any city, state, region → geography ✓
  DEAL SIZE: any Cr/MW/MW figure → deal_size ✓ (for renewable/realestate this IS deal_size)
  STRUCTURE: "full sale", "SPV sale", "100%", "majority stake" → structure ✓
    "economic stability", "financially balanced" → NOT structure, store in intent_focus
  INTERMEDIARY: "one of client" / "investment banker" / "for my client" → advisor
    "i am promoter" / "my business" / "i am the founder" → owner

## STEP C — BUILD SKIP LIST
  For every field found → add to skip list → do NOT ask in response.

## STEP D — SELF-CHECK BEFORE WRITING
  □ Is M4_ in # MODULES IN THIS PROMPT? If yes → M4 bullets MUST appear in my response.
  □ Is # INTERMEDIARY_ROLE unknown? If yes → intermediary question = FIRST LINE, then M3 + M4 follow.
  □ Is # M3_FORMAT: compact? If yes → one sentence, no bullets.
  □ Is # REVENUE_REQUIRED? If yes → ask revenue only, M4 waits.
  □ Is # SHELL_COMPANY_DETECTED? If yes → shell questions only.

## STEP E — SECTOR-TO-M4 MAP
  renewable → M4 RENEWABLE | pharma → M4 PHARMA | saas → M4 SAAS
  manufacturing → M4 MANUFACTURING | defence → M4 DEFENCE | ngo → M4 NGO
  oil_gas → M4 OIL_GAS | finserv → M4 FINSERV
`.trim();

export function buildSystemPrompt(
  state: RouterState,
  matchedMandates: string | null,
): RouterOutput {
  const modules: Array<{ key: string; content: string }> = [];

  modules.push({ key: 'M0_output_schema', content: M0_OUTPUT_SCHEMA });
  modules.push({ key: 'M1_core_identity', content: M1_CORE_IDENTITY });
  modules.push({ key: 'M2_phase_rules',   content: M2_PHASE_RULES });

  if (state.is_profile_search || state.phase === 'PROFILE_SEARCH') {
    modules.push({ key: 'M6_profile_intelligence', content: M6_PROFILE_INTELLIGENCE });
  } else {
    if (state.intent && M3_MODULES[state.intent]) {
      modules.push({ key: `M3_${state.intent}`, content: M3_MODULES[state.intent] });
    }

    // RC9: Shell company overrides sector M4
    if (state.sub_sector === 'shell_company') {
      modules.push({ key: 'M4_shell', content: M4_SHELL });
    } else if (state.sector && M4_MODULES[state.sector]) {
      modules.push({ key: `M4_${state.sector}`, content: M4_MODULES[state.sector] });
    }

    if (state.is_sufficient) {
      const m5Content = buildM5_Matching(matchedMandates);
      modules.push({ key: 'M5_matching', content: m5Content });
    }
  }

  const m4Loaded = modules.some(m => m.key.startsWith('M4_'));

  // RC1: Intermediary — prevents repeated questioning
  const intermediaryLine = state.is_intermediary
    ? `# INTERMEDIARY_ROLE: ${state.is_intermediary} — DO NOT ask the owner/advisor question again. It is known.`
    : `# INTERMEDIARY_ROLE: unknown — if not stated in user's current message, ask once as FIRST LINE only`;

  // RC8: Round count — triggers auto-close
  const roundLine = state.round_count >= 4
    ? `# QUALIFICATION_ROUNDS: ${state.round_count}/4 — LIMIT REACHED. Stop all questions. Summarise and close.`
    : `# QUALIFICATION_ROUNDS: ${state.round_count}/4`;

  // RC10: Compact format when < 3 M3 fields missing
  const missingCount = computeMissingM3Fields(state);
  const compactLine = (missingCount > 0 && missingCount < 3)
    ? `# M3_FORMAT: compact — only ${missingCount} field(s) missing. Write as ONE natural sentence, NOT bullets.`
    : `# M3_FORMAT: standard`;

  // RC11: Revenue mandatory for sell-side
  const revenueLine = (state.intent === 'SELL_SIDE' && !state.revenue)
    ? `# REVENUE_REQUIRED: true — ask revenue + EBITDA FIRST before any M4 questions`
    : `# REVENUE_REQUIRED: false`;

  // RC9: Shell context
  const shellLine = (state.sub_sector === 'shell_company')
    ? `# SHELL_COMPANY_DETECTED: true — ask ONLY Structure · Licence · Compliance · Shareholding`
    : `# SHELL_COMPANY_DETECTED: false`;

  // RC2: Known fields — prevents re-asking
  const knownFields: string[] = [];
  if (state.intent)          knownFields.push(`intent:${state.intent}`);
  if (state.sector)          knownFields.push(`sector:${state.sector}`);
  if (state.sub_sector)      knownFields.push(`sub_sector:${state.sub_sector}`);
  if (state.geography)       knownFields.push(`geography:${state.geography}`);
  if (state.deal_size)       knownFields.push(`deal_size:${state.deal_size}`);
  if (state.revenue)         knownFields.push(`revenue:${state.revenue}`);
  if (state.structure)       knownFields.push(`structure:${state.structure}`);
  if (state.intent_focus)    knownFields.push(`rationale:${state.intent_focus}`);
  if (state.is_intermediary) knownFields.push(`role:${state.is_intermediary}`);

  const phaseContext = [
    `\n# CURRENT CONVERSATION PHASE: ${state.phase}`,
    `# CURRENT INTENT: ${state.intent ?? 'unknown'}`,
    `# TURN: ${state.turn_count + 1} | REFINEMENTS USED: ${state.refinement_count}/3`,
    `# M4 QUESTIONS ASKED THIS SESSION: ${state.m4_questions_asked}`,
    `# MODULES IN THIS PROMPT: ${modules.map(m => m.key).join(', ')}`,
    intermediaryLine,
    roundLine,
    compactLine,
    revenueLine,
    shellLine,
    knownFields.length > 0
      ? `# ██ FIELDS ALREADY PROVIDED — DO NOT ASK AGAIN: ${knownFields.join(' | ')}`
      : `# NO FIELDS EXTRACTED YET`,
    // RC12: Triple-block M4 enforcement
    m4Loaded
      ? `# ██ M4 IS LOADED — SECTOR QUESTIONS REQUIRED IN THIS RESPONSE.\n# ██ Do NOT skip M4. Do NOT defer to next turn. Include all M4 bullets in this message.\n# ██ Flow: M3 fields → blank line → M4 intro line → M4 bullets → set m4_questions_asked=true.`
      : `# M4 NOT LOADED — no sector questions this turn`,
  ].join('\n');

  const systemPrompt = [
    PRE_FLIGHT_EXTRACTION,
    phaseContext,
    ...modules.map(m => m.content),
  ].join('\n\n---\n\n');

  return {
    systemPrompt,
    phase:         state.phase,
    modulesLoaded: modules.map(m => m.key),
    tokenEstimate: Math.round(systemPrompt.length / 4),
  };
}
