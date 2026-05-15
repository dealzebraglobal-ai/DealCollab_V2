/**
 * DealCollab — M5: Matchmaking Execution Layer
 * ==============================================
 * This module defines the REAL matchmaking pipeline types and constants.
 * 
 * Architecture:
 *   M5 owns:
 *     ✔ Reverse intent polarity map
 *     ✔ Scoring weights and dimensions
 *     ✔ Hard rejection filter rules
 *     ✔ Match presentation rules for LLM
 *     ✔ Type exports for the execution engine
 *
 *   M5 does NOT own:
 *     ✘ Proposal creation (route.ts triggers)
 *     ✘ Embedding generation (matchmakingEngine.ts)
 *     ✘ pgvector search (matchmakingEngine.ts → Supabase RPC)
 *     ✘ Database operations (matchmakingEngine.ts)
 *
 * Execution flow:
 *   route.ts (is_complete=true)
 *     → mandate INSERT
 *     → matchmakingEngine.executeMatchmaking()
 *       → Phase 1: Proposal + normalized text
 *       → Phase 2: OpenAI embedding (text-embedding-3-small)
 *       → Phase 3: Reverse intent resolution (this module)
 *       → Phase 4: pgvector similarity search (top 30)
 *       → Phase 5: Hard rejection filters (this module)
 *       → Phase 6: Weighted scoring (this module)
 *       → Phase 7: Match insertion
 *       → Phase 8: Frontend rendering via /api/matches
 */

// ─────────────────────────────────────────────────────────────
// REVERSE INTENT POLARITY
// CRITICAL: Never match same-side intents
// ─────────────────────────────────────────────────────────────

export const REVERSE_INTENT_MAP: Record<string, string> = {
  SELL_SIDE: 'BUY_SIDE',
  BUY_SIDE: 'SELL_SIDE',
  FUNDRAISING: 'INVESTMENT',
  INVESTMENT: 'FUNDRAISING',
  DEBT: 'DEBT',                         // Both sides valid
  STRATEGIC_PARTNERSHIP: 'STRATEGIC_PARTNERSHIP', // Both sides valid
};

// ─────────────────────────────────────────────────────────────
// SCORING WEIGHTS
// ─────────────────────────────────────────────────────────────

export const SCORING_WEIGHTS = {
  INTENT:    0.50,   // Intent match → 50%
  INDUSTRY:  0.20,   // Industry/sector alignment → 20%
  FINANCIAL: 0.20,   // Financial compatibility → 20%
  NICHE:     0.10,   // Niche/technology alignment → 10%
  // Geography is a dynamic boost, not a fixed weight
} as const;

// ─────────────────────────────────────────────────────────────
// HARD REJECTION THRESHOLDS
// ─────────────────────────────────────────────────────────────

export const REJECTION_THRESHOLDS = {
  /** Maximum ticket size ratio before rejection (e.g., ₹10 Cr vs ₹500 Cr) */
  MAX_TICKET_RATIO: 50,
  /** Maximum revenue ratio before rejection */
  MAX_REVENUE_RATIO: 50,
  /** Minimum cosine similarity to even consider */
  MIN_SIMILARITY: 0.15,
} as const;

// ─────────────────────────────────────────────────────────────
// EMBEDDING CONFIG
// ─────────────────────────────────────────────────────────────

export const EMBEDDING_CONFIG = {
  MODEL: 'text-embedding-3-small',
  DIMENSIONS: 1536,
  MAX_CANDIDATES: 30,
  MAX_STORED_MATCHES: 10,
} as const;

// ─────────────────────────────────────────────────────────────
// MATCH PRESENTATION RULES (injected into LLM prompt)
// ─────────────────────────────────────────────────────────────

export const M5_MATCH_PRESENTATION = `
## M5: MATCH INTELLIGENCE PRESENTATION
Matched counterparties have been identified via semantic analysis.

### Presentation rules:
1. "We have identified [N] potentially aligned counterpart[y/ies] in our network."
2. Per match: "[Sector] · [Geography] · [Size compatibility]" + one sentence why relevant.
3. NEVER reveal: name · firm · contact · mandate ID · user identity.
4. Show ONLY: sector, geography, compatibility score, and match reasoning.
5. "To connect, send a connection request from your Deal Dashboard.
   Tokens deducted only if both parties approve."
6. Then deliver closure message verbatim.

### Match quality indicators:
Score 80-100: "Strong alignment" — high confidence match
Score 60-79:  "Good compatibility" — worth exploring
Score 40-59:  "Moderate alignment" — review recommended
Below 40:     Do not present to user

✘ Never fabricate counterparty details.
✘ Never expose confidential identity.
✘ Never present matches below score threshold.
`.trim();

// ─────────────────────────────────────────────────────────────
// MODULE DIAGNOSTICS
// ─────────────────────────────────────────────────────────────

export const M5_DIAGNOSTICS = {
  version: '2.0.0',
  engine: 'pgvector + OpenAI text-embedding-3-small',
  scoringModel: 'weighted composite (intent 50%, industry 20%, financial 20%, niche 10%)',
  pipeline: [
    'proposal_creation',
    'normalized_text_generation',
    'embedding_generation',
    'reverse_intent_resolution',
    'pgvector_similarity_search',
    'hard_rejection_filtering',
    'weighted_scoring',
    'match_insertion',
    'frontend_rendering',
  ],
  loadRule: 'Triggered automatically after mandate is_complete=true + DB INSERT SUCCESS',
} as const;