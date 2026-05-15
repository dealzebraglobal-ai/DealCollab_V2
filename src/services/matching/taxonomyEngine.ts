/**
 * DealCollab — Taxonomy Engine
 * ===========================
 * Implements DC-MATCH-001 v1.0 Sector Compatibility.
 * Replaces broken exact-sector matching with semantic adjacency.
 */

import { SectorKey } from '@/lib/types';

export interface SectorRelation {
  level: 'COMPATIBLE' | 'NARROW' | 'INCOMPATIBLE';
  penalty: number;
  reason: string;
}

export const CANONICAL_TAXONOMY: Partial<Record<SectorKey, Partial<Record<SectorKey, SectorRelation>>>> = {
  saas: {
    manufacturing: { level: 'COMPATIBLE', penalty: 0, reason: 'Industrial digitization (Industry 4.0)' },
    logistics: { level: 'COMPATIBLE', penalty: 0, reason: 'Supply chain digitization' },
    pharma: { level: 'NARROW', penalty: 0.10, reason: 'Health-tech overlap' },
    finserv: { level: 'COMPATIBLE', penalty: 0, reason: 'Fintech synergy' },
  },
  renewable: {
    manufacturing: { level: 'COMPATIBLE', penalty: 0, reason: 'Sustainable manufacturing synergy' },
    realestate: { level: 'COMPATIBLE', penalty: 0, reason: 'Infrastructure and land adjacency' },
    oil_gas: { level: 'NARROW', penalty: 0.15, reason: 'Energy transition alignment' },
  },
  manufacturing: {
    renewable: { level: 'COMPATIBLE', penalty: 0, reason: 'Clean energy components production' },
    defence: { level: 'COMPATIBLE', penalty: 0, reason: 'Precision engineering overlap' },
    chemicals: { level: 'COMPATIBLE', penalty: 0, reason: 'Industrial processing synergy' },
  },
  finserv: {
    saas: { level: 'COMPATIBLE', penalty: 0, reason: 'Fintech and digital banking synergy' },
    realestate: { level: 'NARROW', penalty: 0.15, reason: 'Mortgage and financing overlap' },
  },
  pharma: {
    manufacturing: { level: 'COMPATIBLE', penalty: 0, reason: 'API and formulation manufacturing' },
    logistics: { level: 'NARROW', penalty: 0.10, reason: 'Specialized medical cold chain' },
  }
};

/**
 * Resolves compatibility between two sectors.
 */
export function getSectorCompatibility(source: string | null | undefined, target: string | null | undefined): SectorRelation {
  if (!source || !target) return { level: 'NARROW', penalty: 0.2, reason: 'Undefined sector context' };

  const s = source.toLowerCase() as SectorKey;
  const t = target.toLowerCase() as SectorKey;

  if (s === t) return { level: 'COMPATIBLE', penalty: 0, reason: 'Exact sector match' };

  const relation = CANONICAL_TAXONOMY[s]?.[t] || CANONICAL_TAXONOMY[t]?.[s];
  
  if (relation) return relation;

  // Default fallback for unknown pairs
  return { level: 'NARROW', penalty: 0.15, reason: 'General market adjacency' };
}
