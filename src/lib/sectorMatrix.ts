// src/lib/sectorMatrix.ts
/**
 * DealCollab — Sector Compatibility Matrix (KB-3)
 * Source: DC-MATCH-001 §10.3
 * Used by: scoringEngine.ts (HR-4 + soft bonus adjacency)
 */

import type { SectorKey } from './promptRouter';

type SectorRule = {
    exact_match: SectorKey[];
    adjacent: SectorKey[];
    incompatible: SectorKey[];
};

export const SECTOR_COMPATIBILITY: Record<SectorKey, SectorRule> = {
    pharma: {
        exact_match: ['pharma'],
        // NM1: healthcare (delivery) is adjacent to pharma (manufacturing) — shared ecosystem
        adjacent: ['chemicals', 'healthcare'],
        incompatible: ['realestate', 'logistics', 'hospitality', 'oil_gas', 'ngo'],
    },
    // NM1: healthcare sector (hospitals, clinics, diagnostics, healthtech)
    healthcare: {
        exact_match: ['healthcare'],
        adjacent: ['pharma'],
        incompatible: ['manufacturing', 'oil_gas', 'defence', 'chemicals', 'logistics',
                       'realestate', 'finserv', 'ngo'],
    },
    manufacturing: {
        exact_match: ['manufacturing'],
        adjacent: ['chemicals', 'defence', 'consumer'],
        incompatible: ['finserv', 'saas', 'education', 'ngo', 'hospitality'],
    },
    saas: {
        exact_match: ['saas'],
        adjacent: ['education'],
        // finserv (NBFC/lending) excluded per spec — a digital/SaaS mandate must not surface traditional FS
        incompatible: ['manufacturing', 'realestate', 'oil_gas', 'pharma', 'chemicals', 'ngo',
                       'finserv', 'hospitality', 'logistics', 'defence', 'renewable', 'consumer'],
    },
    finserv: {
        exact_match: ['finserv'],
        adjacent: ['saas'],   // finserv CAN look for SaaS targets (e.g. fintech acquisition)
        incompatible: ['manufacturing', 'realestate', 'logistics', 'pharma', 'chemicals', 'oil_gas', 'ngo'],
    },
    consumer: {
        exact_match: ['consumer'],
        adjacent: ['manufacturing', 'hospitality'],
        incompatible: ['oil_gas', 'defence', 'ngo'],
    },
    realestate: {
        exact_match: ['realestate'],
        adjacent: ['hospitality'],
        incompatible: ['saas', 'finserv', 'pharma', 'chemicals', 'defence', 'ngo'],
    },
    logistics: {
        exact_match: ['logistics'],
        adjacent: ['manufacturing'],
        incompatible: ['saas', 'finserv', 'pharma', 'education', 'ngo'],
    },
    education: {
        exact_match: ['education'],
        adjacent: ['saas', 'ngo'],
        incompatible: ['manufacturing', 'oil_gas', 'chemicals', 'defence', 'realestate'],
    },
    chemicals: {
        exact_match: ['chemicals'],
        adjacent: ['manufacturing', 'pharma', 'oil_gas'],
        incompatible: ['saas', 'finserv', 'education', 'ngo', 'hospitality'],
    },
    hospitality: {
        exact_match: ['hospitality'],
        adjacent: ['realestate', 'consumer'],
        incompatible: ['manufacturing', 'pharma', 'chemicals', 'defence', 'oil_gas'],
    },
    renewable: {
        exact_match: ['renewable'],
        adjacent: ['manufacturing', 'oil_gas'],
        incompatible: ['saas', 'finserv', 'pharma', 'education', 'ngo', 'hospitality'],
    },
    defence: {
        exact_match: ['defence'],
        adjacent: ['manufacturing'],
        incompatible: ['ngo', 'education', 'hospitality', 'realestate', 'pharma'],
    },
    oil_gas: {
        exact_match: ['oil_gas'],
        adjacent: ['chemicals', 'renewable'],
        incompatible: ['saas', 'finserv', 'education', 'pharma', 'ngo', 'hospitality'],
    },
    ngo: {
        exact_match: ['ngo'],
        adjacent: ['education'],
        incompatible: ['manufacturing', 'oil_gas', 'chemicals', 'defence', 'finserv', 'realestate', 'pharma'],
    },
    mixed: {
        exact_match: ['mixed'],
        adjacent: [],
        incompatible: [],
    },
};

export function sectorsAreCompatible(
    qSector: SectorKey | null,
    cSectors: (SectorKey | string)[] | null | undefined,
): boolean {
    // If query has no sector, any candidate is OK
    if (!qSector) return true;

    // If query has a specific sector but candidate has NO sector tag,
    // reject it — an untagged proposal is not a SaaS/pharma/finserv match.
    if (!cSectors || cSectors.length === 0) return false;

    const rule = SECTOR_COMPATIBILITY[qSector];
    if (!rule) return true;

    const cSet = cSectors.map(s => (typeof s === 'string' ? s.toLowerCase() : s) as SectorKey);

    // Pass if at least one of the candidate's sectors is an exact match or adjacent.
    // We do NOT hard-reject on incompatible here — a company tagged ['saas', 'consumer']
    // should still match a SaaS query even though 'consumer' is incompatible.
    // Scoring penalises cross-sector matches via sector_score=0; HR-4 is the gate,
    // not the ranker. Sector legitimacy is validated separately by HR-7 (isSectorLegitimate).
    return cSet.some(cs => rule.exact_match.includes(cs) || rule.adjacent.includes(cs));
}

export type AdjacencyLevel = 'exact' | 'adjacent' | 'unrelated' | 'incompatible';

export function sectorAdjacency(qSector: SectorKey, cSector: SectorKey | string): AdjacencyLevel {
    const cs = (typeof cSector === 'string' ? cSector.toLowerCase() : cSector) as SectorKey;
    const rule = SECTOR_COMPATIBILITY[qSector];
    if (!rule) return 'unrelated';
    if (rule.exact_match.includes(cs)) return 'exact';
    if (rule.adjacent.includes(cs)) return 'adjacent';
    if (rule.incompatible.includes(cs)) return 'incompatible';
    return 'unrelated';
}