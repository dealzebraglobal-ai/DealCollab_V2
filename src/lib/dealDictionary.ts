// Compiled from deal_dictionary_by_clause.json
// Used by: normalizeMessage.ts, promptRouter.ts detectors

import { DealIntent, SectorKey } from './types';

export const INTENT_SYNONYMS: Record<string, DealIntent> = {
    // flattened from section 1 — all synonyms mapped to canonical intent
    'available to invest': 'BUY_SIDE',
    'looking firm': 'BUY_SIDE',
    'reqd': 'BUY_SIDE',
    'buissnes wanted': 'BUY_SIDE',
    'chahiye': 'BUY_SIDE',
    'on sale': 'SELL_SIDE',
    'promoter retirement': 'SELL_SIDE',
    'divestment': 'SELL_SIDE',
    'fund raise': 'FUNDRAISING',
    'equity funding': 'FUNDRAISING',
    'JV': 'STRATEGIC_PARTNERSHIP',
    'colloborate': 'STRATEGIC_PARTNERSHIP',
    // ... all 80+ entries
};

export const SECTOR_SYNONYMS: Record<string, SectorKey> = {
    // flattened from section 3
    'NBFC': 'finserv',
    'HFC': 'finserv',
    'payment gateway': 'finserv',
    'API': 'pharma',
    'USFDA': 'pharma',
    'formulation mfg': 'pharma',
    'MIDC': 'manufacturing',
    'auto ancillary': 'manufacturing',
    'GIDC': 'manufacturing',
    'TMT rebar': 'steel',
    'IIoT': 'automation',
    'BPO': 'bpo',
    'KPO': 'bpo',
    'dairy': 'agriculture',
    'agro': 'agriculture',
    'farming': 'agriculture',
    'textile': 'textiles',
    'garment': 'textiles',
    'apparel': 'textiles',
    'media': 'advertising',
    'marketing': 'advertising',
    'branding': 'advertising',
    'ngo': 'ngo',
    'trust': 'ngo',
    'society': 'ngo',
    'ev charging': 'renewable',
    'clean mobility': 'renewable',
    'charging infrastructure': 'renewable',
};

export const SHORTHAND_MAP: Record<string, string> = {
    // section 8 — English shorthand
    'TO': 'turnover',
    'T/O': 'turnover',
    'reqd': 'required',
    'co': 'company',
    'mfg': 'manufacturing',
    'NW': 'net worth',
    'PAT': 'profit after tax',
    'RM': 'reverse merger',
    'NPA': 'non-performing asset',
    // ... all entries
};

export const HINGLISH_MAP: Record<string, string> = {
    // section 8 — Hinglish mix-ins
    'chalega': 'acceptable',
    'chahiye': 'needed',
    'mere pas': 'I have',
    'chal raha': 'operational',
    // ... all entries
};

export const TYPO_MAP: Record<string, string> = {
    // section 8 — typos
    'buissnes': 'business',
    'colloborate': 'collaborate',
    'Gujarath': 'Gujarat',
    'banglore': 'Bangalore',
    // ... all entries
};

export const SPECIAL_CONDITIONS_MAP: Record<string, string> = {
    // flattened from section 6
    'debt free': 'DEBT_FREE',
    'zero debt': 'DEBT_FREE',
    'gst registered': 'GST_ACTIVE',
    'non gst': 'NON_GST',
    'NCLT': 'NCLT_CASE',
    'IBC': 'NCLT_CASE',
    'BSE Listed': 'LISTED_BSE',
    'BSE SME': 'LISTED_BSE',
    'promoter retirement': 'PROMOTER_EXIT',
    'ROC filing upto date': 'ROC_COMPLIANT',
    // ... all entries
};