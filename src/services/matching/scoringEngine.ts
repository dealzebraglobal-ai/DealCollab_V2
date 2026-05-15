/**
 * DealCollab — Hybrid Scoring Engine
 * ==================================
 * PHASE 4: 50/20/15/10/5 Production Formula
 */

import { ProposalInput } from '@/lib/matchmakingEngine';
import { getSectorCompatibility } from './taxonomyEngine';
import { Candidate } from './rejectionEngine';

export interface ScoreBreakdown {
  finalScore: number;
  cosineScore: number;
  industryScore: number;
  dealSizeScore: number;
  intentFocusScore: number;
  geographyScore: number;
}

export function computeCompositeScore(source: ProposalInput, candidate: Candidate): ScoreBreakdown {
  // 1. Semantic Similarity (50%)
  const cosineScore = candidate.similarity || 0;

  // 2. Industry Alignment (20%)
  const sectorComp = getSectorCompatibility(source.sector, candidate.sectors?.[0]);
  const industryScore = sectorComp.level === 'COMPATIBLE' ? 1.0 : sectorComp.level === 'NARROW' ? 0.6 : 0.1;

  // 3. Deal Size Fit (15%)
  let dealSizeScore = 0.5; // Neutral start
  const sMax = parseFloat(source.deal_size_max || '0');
  const cMax = candidate.deal_size_max || 0;
  if (sMax > 0 && cMax > 0) {
    const ratio = Math.max(sMax, cMax) / Math.max(Math.min(sMax, cMax), 0.01);
    dealSizeScore = ratio < 1.5 ? 1.0 : ratio < 3 ? 0.7 : ratio < 5 ? 0.4 : 0.1;
  }

  // 4. Intent Focus / Strategic Alignment (10%)
  let intentFocusScore = 0.3;
  if (source.intent_focus && candidate.normalised_text.toLowerCase().includes(source.intent_focus.toLowerCase())) {
    intentFocusScore = 1.0;
  } else if (source.structure && candidate.deal_structure === source.structure) {
    intentFocusScore = 0.8;
  }

  // 5. Geography Fit (5%)
  let geographyScore = 0.4;
  if (source.geography && candidate.geographies?.includes(source.geography)) {
    geographyScore = 1.0;
  }

  // COMPOSITE FORMULA (Rule: 0.50 + 0.20 + 0.15 + 0.10 + 0.05)
  const finalScore = (
    (cosineScore * 0.50) +
    (industryScore * 0.20) +
    (dealSizeScore * 0.15) +
    (intentFocusScore * 0.10) +
    (geographyScore * 0.05)
  );

  return {
    finalScore: Math.round(finalScore * 100) / 100,
    cosineScore,
    industryScore,
    dealSizeScore,
    intentFocusScore,
    geographyScore
  };
}
