/**
 * DealCollab — Hard Rejection Engine
 * ==================================
 * Rule 11: Implement 6 hard rejection rules (HR-1 to HR-6).
 */

import { ProposalInput } from '@/lib/matchmakingEngine';

export interface Candidate {
  id: string;
  user_id: string;
  intent: string;
  sectors: string[] | null;
  geographies: string[] | null;
  deal_size_min: number | null;
  deal_size_max: number | null;
  revenue_min: number | null;
  revenue_max: number | null;
  deal_structure: string | null;
  normalised_text: string;
  proposal_quality_score: number | null;
  similarity: number;
  status: string;
}

export function passesHardRules(source: ProposalInput, candidate: Candidate): { passes: boolean; reason?: string } {
  // HR-1: Intent polarity mismatch
  const INTENT_FLIP: Record<string, string> = {
    BUY_SIDE: "SELL_SIDE",
    SELL_SIDE: "BUY_SIDE",
    FUNDRAISING: "BUY_SIDE"
  };
  if (!source.intent) return { passes: false, reason: 'HR-1: Intent missing' };
  const flipped = INTENT_FLIP[source.intent];
  if (flipped && candidate.intent !== flipped && source.intent !== 'DEBT' && source.intent !== 'STRATEGIC_PARTNERSHIP') {
    return { passes: false, reason: 'HR-1: Intent polarity mismatch' };
  }

  // HR-2: Revenue mismatch >5x
  const sRev = parseFloat(source.revenue_max || '0');
  const cRev = candidate.revenue_max || 0;
  if (sRev > 0 && cRev > 0) {
    const ratio = Math.max(sRev, cRev) / Math.max(Math.min(sRev, cRev), 0.01);
    if (ratio > 5) return { passes: false, reason: 'HR-2: Revenue mismatch >5x' };
  }

  // HR-3: Deal structure incompatible
  if (source.structure && candidate.deal_structure && source.structure !== candidate.deal_structure) {
    if (source.structure.includes('Asset') && candidate.deal_structure.includes('Equity')) {
      return { passes: false, reason: 'HR-3: Structure mismatch (Asset vs Equity)' };
    }
  }

  // HR-5: Inactive mandate
  if (candidate.status !== 'ACTIVE') {
    return { passes: false, reason: 'HR-5: Inactive mandate' };
  }

  // HR-6: Advisor flood cap (omitted for now, requires global state/DB check)

  return { passes: true };
}
