/**
 * 🧱 DEAL INTELLIGENCE TYPES
 * Shared types for Router, Dictionary, and Intelligence Engine.
 */

export type DealIntent =
  | 'SELL_SIDE'
  | 'BUY_SIDE'
  | 'FUNDRAISING'
  | 'DEBT'
  | 'STRATEGIC_PARTNERSHIP'
  | null;

export type SectorKey =
  | 'manufacturing'
  | 'pharma'
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
  | 'agriculture'
  | 'textiles'
  | 'bpo'
  | 'advertising'
  | 'ngo'
  | 'mixed'
  | 'steel' // Keeping these for backward compatibility if needed, though M4 absorbs them
  | 'automation'
  | 'oil_gas';

export type ConversationPhase =
  | 'ENTRY'
  | 'QUALIFICATION'
  | 'MOMENTUM'
  | 'CLOSURE'
  | 'MATCHING'
  | 'PROFILE_SEARCH';

export interface RouterState {
  intent: DealIntent;
  sector: SectorKey | null;
  sub_sector: string | null;
  geography: string | null;
  deal_size: string | null;
  revenue: string | null;
  structure: string | null;
  intent_focus: string | null;
  is_intermediary: boolean | null; // Added per M3 requirement
  industry_data: Record<string, unknown>;
  is_sufficient: boolean;
  is_complete: boolean;
  is_profile_search: boolean;
  phase: ConversationPhase;
  turn_count: number;
  refinement_count: number;
  special_conditions: string[];
  strategic_intent: string | null;
  round_count: number;
  m4_questions_asked: boolean;
}
