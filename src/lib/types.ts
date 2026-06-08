// ─────────────────────────────────────────────────────────────
// DEAL INTENT
// ─────────────────────────────────────────────────────────────

export type DealIntent =
  | 'SELL_SIDE'
  | 'BUY_SIDE'
  | 'FUNDRAISING'
  | 'DEBT'
  | 'STRATEGIC_PARTNERSHIP'
  | null;

// ─────────────────────────────────────────────────────────────
// SECTOR KEY
// NM1: pharma (manufacturing) and healthcare (delivery) are separate
// RC7: oil_gas and ngo added as dedicated sectors
// ─────────────────────────────────────────────────────────────

export type SectorKey =
  | 'pharma'        // API · formulations · CRAMS · CDMO · pharma manufacturing ONLY
  | 'healthcare'    // hospitals · clinics · diagnostics · digital health · devices (NM1)
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
  | 'oil_gas'       // RC7
  | 'ngo'           // RC7
  | 'mixed';

// ─────────────────────────────────────────────────────────────
// CONVERSATION PHASE
// INTENT_VALIDATION added for NM7 quality gate flow
// ─────────────────────────────────────────────────────────────

export type ConversationPhase =
  | 'ENTRY'
  | 'QUALIFICATION'
  | 'MOMENTUM'
  | 'CLOSURE'
  | 'MATCHING'
  | 'PROFILE_SEARCH'
  | 'INTENT_VALIDATION';  // NM7: awaiting genuine-mandate confirmation

// ─────────────────────────────────────────────────────────────
// ROUTER STATE
// Single source of truth for conversation state, persisted per session.
// ─────────────────────────────────────────────────────────────

export interface RouterState {
  // Core deal fields
  intent: DealIntent;
  sector: SectorKey | null;
  sub_sector: string | null;
  geography: string | null;
  deal_size: string | null;
  revenue: string | null;
  structure: string | null;
  intent_focus: string | null;
  industry_data: Record<string, unknown>;

  // Conversation state flags
  is_sufficient: boolean;
  is_complete: boolean;
  is_profile_search: boolean;
  is_intermediary: 'owner' | 'advisor' | null;  // RC1
  is_document_intake: boolean;                    // NM6
  is_shell_query: boolean;                      // NM5

  // Special mode flags
  gateway_clarifier: string | null;               // NM3

  // Quality gate (NM7)
  quality_score: number;
  quality_gate_passed: boolean;
  quality_gate_attempted: boolean;
  intent_validated: boolean | null;         // null=not asked, true=yes, false=no

  // M4 sector intelligence tracking
  m4_questions_asked: boolean;

  // Phase + turn tracking
  phase: ConversationPhase;
  turn_count: number;
  refinement_count: number;
  round_count: number;                       // RC8

  // Extended fields
  special_conditions: string[];
  strategic_intent: string | null;
  proposal_id?: string | null;
}

// ─────────────────────────────────────────────────────────────
// ROUTER OUTPUT
// Returned by buildSystemPrompt()
// ─────────────────────────────────────────────────────────────

export interface RouterOutput {
  systemPrompt: string;
  phase: ConversationPhase;
  modulesLoaded: string[];
  tokenEstimate: number;
}