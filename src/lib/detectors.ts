import { normalizeSize } from './dataQuality';
import type { DealIntent, SectorKey } from './types';

// ─────────────────────────────────────────────────────────────
// VALID SECTOR KEYS
// ─────────────────────────────────────────────────────────────

export const VALID_SECTOR_KEYS: SectorKey[] = [
    'pharma', 'healthcare', 'manufacturing', 'saas', 'finserv', 'consumer',
    'realestate', 'logistics', 'education', 'chemicals', 'hospitality',
    'renewable', 'defence', 'oil_gas', 'ngo', 'mixed',
];

// ─────────────────────────────────────────────────────────────
// SECTOR KEYWORDS
// NM1: pharma and healthcare fully separated
// ─────────────────────────────────────────────────────────────

const SECTOR_KEYWORDS: Record<SectorKey, string[]> = {
    // NM1: Pharma = science/manufacturing side ONLY
    pharma: [
        'pharma', 'pharmaceutical', 'api pharma', 'formulation', 'crams', 'cdmo',
        'drug manufacturer', 'drug manufacturing', 'active pharmaceutical',
        'generic drug', 'dossier', 'molecule', 'usfda', 'mhra', 'who-gmp',
        'pharma plant', 'pharma manufacturing', 'bulk drug',
    ],
    // NM1: Healthcare = delivery/services side ONLY
    healthcare: [
        'hospital', 'clinic', 'healthcare', 'diagnostics', 'medical device',
        'digital health', 'healthtech', 'nabh', 'nabl', 'multispeciality',
        'multispecialty', 'multi-speciality', 'medical centre', 'health chain',
        'diagnostic chain', 'radiology', 'pathology', 'occupancy rate',
        'bed count', 'patient volume', 'doctor concentration',
    ],
    manufacturing: [
        'manufactur', 'industrial', 'oem', 'plant', 'factory', 'auto component',
        'auto parts', 'precision engineering', 'casting', 'forging',
        'machining', 'cnc', 'vmc', 'fitness equipment', 'equipment manufactur',
    ],
    saas: [
        'saas', 'software', 'tech startup', 'arr', 'mrr', 'b2b software',
        'platform', 'app', 'mobile app', 'cloud', 'enterprise software',
        'digital marketing', 'marketing agency', 'performance marketing',
        'advertising agency', 'adtech', 'digital agency', 'seo agency',
        'it services', 'it company', 'it firm', 'managed services',
    ],
    finserv: [
        'nbfc', 'lending', 'fintech', 'financial service', 'insurance',
        'wealth management', 'aum', 'loan book', 'bfsi', 'microfinance',
        'payment', 'neo bank', 'mfi', 'hfc',
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
        'ev charging', 'charging infrastructure', 'clean mobility',
        'battery storage', 'energy storage', 'ess', 'bess',
        'ev infrastructure', 'electric mobility', 'smart charging',
    ],
    defence: [
        'defence', 'defense', 'aerospace', 'drdl', 'drdo', 'hal', 'military',
        'government tender', 'ordnance', 'security equipment',
        'defence manufactur', 'defense manufactur',
        'defence company', 'defense company', 'defence sector', 'defense sector',
    ],
    oil_gas: [
        'refinery', 'oil & gas', 'oil and gas', 'petroleum', 'crude oil',
        'lpg plant', 'natural gas', 'downstream oil', 'petrochemical',
        'storage terminal', 'pipeline', 'naphtha', 'bitumen', 'condensate',
        'mmtpa', 'fuel depot', 'gas processing', 'topping unit', 'tank farm',
        'pngrb', 'peso clearance',
    ],
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
// RC4: 'investor' removed from FUNDRAISING — financial investor = BUY_SIDE
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
        'growth capital for', 'strategic investor',
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

// RC5: Profile search expanded with talent/recruitment keywords
const PROFILE_INTENT_KEYWORDS = [
    'find advisor', 'find banker', 'find consultant', 'find a professional', 'find an advisor',
    'need an advisor', 'looking for advisor', 'who can help', 'find someone who works in',
    'recommend a banker', 'recommend an advisor', 'looking for an m&a professional',
    'find a ca', 'find a lawyer', 'find a deal professional',
    'references for', 'looking for candidates', 'need candidates', 'hiring for',
    'recruitment', 'talent search', 'headhunt', 'sap project manager',
];

// RC3: Friction signals expanded to 30+ patterns
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
// DETECTION FUNCTIONS — all exported, all pure
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

// RC1: Intermediary detection — semantic patterns, not just explicit phrases
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

// RC2: Pre-detect deal size using normalizeSize
export function detectDealSizeFromText(text: string): string | null {
    const n = normalizeSize(text);
    if (!n || n.min_cr == null) return null;
    if (n.min_cr === n.max_cr) return `₹${n.min_cr} Cr`;
    return `₹${n.min_cr}–${n.max_cr} Cr`;
}

// RC2: Pre-detect revenue — only fires if revenue keyword nearby
export function detectRevenueFromText(text: string): string | null {
    const lower = text.toLowerCase();
    if (!/revenue|turnover|t\/o|topline|sales/i.test(lower)) return null;
    const n = normalizeSize(text);
    if (!n || n.min_cr == null) return null;
    if (n.min_cr === n.max_cr) return `₹${n.min_cr} Cr`;
    return `₹${n.min_cr}–${n.max_cr} Cr`;
}

// NM5: Shell QUERY detection — is the user LOOKING FOR a shell?
export function detectShellQuery(text: string): boolean {
    const lower = text.toLowerCase();
    const shellQuerySignals = [
        'section 8 company', 'shell company', 'listed company', 'dormant company',
        'ready to use company', 'shelf company', 'clean company',
        '80g company', '12a company', 'fcra company', 'fcra registered',
        'listed entity', 'bse listed company', 'nse listed company',
        'compliance shell', 'roc compliant company',
        'gst surrendered company', 'blank company',
    ];
    const score = shellQuerySignals.filter(s => lower.includes(s)).length;
    if (score > 0) console.log(`[DETECTOR] Shell query signals: ${score}`);
    return score >= 1;
}

// NM3: Gateway sector — catches ambiguous signals needing ONE clarifier
export function detectGatewaySector(text: string, sector: SectorKey | null): string | null {
    const lower = text.toLowerCase();

    // EPC: contractor executing jobs vs asset owner
    if (sector === 'renewable') {
        const isEpcContractor = lower.includes('epc company') || lower.includes('epc firm') ||
            lower.includes('epc contractor') || lower.includes('epc business') ||
            lower.includes('engineering procurement construction');
        const isAssetOwner = lower.includes('ipp') || lower.includes('operating asset') ||
            lower.includes('ppa') || lower.includes('mw asset') ||
            lower.includes('power plant') || lower.includes('solar plant');
        if (isEpcContractor && !isAssetOwner) {
            console.log('[DETECTOR] Gateway: epc_type');
            return 'epc_type';
        }
    }

    // IT Services: product vs services delivery
    if (sector === 'saas') {
        const isServices = lower.includes('it services') || lower.includes('it company') ||
            lower.includes('it firm') || lower.includes('managed services') ||
            lower.includes('it staffing');
        const isProduct = lower.includes('saas') || lower.includes('software product') ||
            lower.includes('arr') || lower.includes('mrr') ||
            lower.includes('platform') || lower.includes('subscription');
        if (isServices && !isProduct) {
            console.log('[DETECTOR] Gateway: it_type');
            return 'it_type';
        }
    }

    return null;
}