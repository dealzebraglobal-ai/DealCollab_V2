/**
 * DealCollab — Explanation Engine
 * ==============================
 * Rule 15: Generate deterministic explanations, not LLM hallucinations.
 */

import { ProposalInput } from '@/lib/matchmakingEngine';
import { getSectorCompatibility } from './taxonomyEngine';

import { Candidate } from './rejectionEngine';

export function generateExplanation(source: ProposalInput, candidate: Candidate): string[] {
  const explanations: string[] = [];

  const sectorComp = getSectorCompatibility(source.sector, candidate.sectors?.[0]);
  if (sectorComp.level === 'COMPATIBLE') {
    explanations.push(`Sector alignment: ${sectorComp.reason}`);
  }

  if (source.geography && candidate.geographies?.includes(source.geography)) {
    explanations.push(`Geography overlap in ${source.geography}`);
  }

  if (candidate.similarity > 0.8) {
    explanations.push("Strong semantic similarity in strategic intent");
  }

  if (source.structure && candidate.deal_structure === source.structure) {
    explanations.push(`Matches preferred deal structure: ${source.structure}`);
  }

  const sMax = parseFloat(source.deal_size_max || '0');
  const cMax = candidate.deal_size_max_cr || 0;
  if (sMax > 0 && cMax > 0) {
    const ratio = Math.max(sMax, cMax) / Math.max(Math.min(sMax, cMax), 0.01);
    if (ratio < 2) explanations.push("Highly compatible deal size range");
  }

  return explanations;
}
