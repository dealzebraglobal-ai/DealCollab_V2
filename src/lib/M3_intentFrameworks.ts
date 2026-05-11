/**
 * DealCollab Prompt Router — M3: Intent Qualification Frameworks
 * ==============================================================
 * Canonical source:
 *   V1 §7, §8, §9, §10 · V2 §7–§10 · V3 §7–§10
 *   Deal Dictionary §1 (intent synonym classification)
 *
 * SESSION FIXES APPLIED:
 *   RC1 — Intermediary question is now conditional on # INTERMEDIARY_ROLE
 *     Previous: "Opening (ask first, embedded in the grouped block): Are you..."
 *     — This caused the question to repeat every single turn because it was
 *     always present in the module regardless of whether it was already answered.
 *     Fix: Each sub-module now reads # INTERMEDIARY_ROLE from phaseContext.
 *     "owner" or "advisor" → skip entirely.
 *     "unknown" → ask once, as standalone line, blank line after.
 *
 *   RC6 — M3_SELL_SIDE duplicate question merged
 *     Previous: separate "annual revenue range" + "business size and financial profile"
 *     These are functionally the same question. Users correctly flagged this.
 *     Fix: Merged into one: "What is the approximate annual revenue and EBITDA
 *     or profitability range?" One question, two signals, richer answer.
 *
 * Scope — M3 exclusively owns:
 *   ✔ Minimum required fields per intent (Block 1)
 *   ✔ Optional / contextual fields per intent
 *   ✔ Intermediary detection and posture adjustment (now conditional)
 *   ✔ Post-qualification refinement hints per intent
 *
 *   ✘ Sector-specific questions         → M4 (Block 2)
 *   ✘ Phase switching / format rules    → M2
 *   ✘ Matching layer                    → M5
 *   ✘ Profile search                    → M6
 *
 * Load rule: CONDITIONAL — exactly ONE sub-module per request.
 * Token budget: ~140 tokens per sub-module.
 */

import type { DealIntent } from './promptRouter';

// ─────────────────────────────────────────────────────────────
// M3_A — SELL-SIDE
// RC1: intermediary conditional | RC6: duplicate question merged
// ─────────────────────────────────────────────────────────────

const M3_SELL_SIDE = `
## M3: SELL-SIDE QUALIFICATION

INTERMEDIARY QUESTION — conditional on # INTERMEDIARY_ROLE:
  "owner" or "advisor" → SKIP entirely. The role is already known. Never ask.
  "unknown" → Ask as the FIRST LINE of your response (not the only content). One blank line after, then continue with M3 + M4 in the SAME message:
  "Are you the business owner / promoter, or an advisor representing a client?"
  If advisor: teaser-level data is sufficient — share only what's authorised.
  If owner: proceed with fields below.

Minimum required fields — ask only those NOT in # FIELDS ALREADY PROVIDED:
• What does the business do, and where does it operate? [SKIP if sector + geography known]
• What is the approximate annual revenue and EBITDA or profitability range? [SKIP if revenue known]
• What kind of transaction are you looking for — and what is driving that decision? [SKIP if structure known]

Note: Revenue + financial profile is ONE question. Never split them into two separate bullets.

Ask only when context makes them useful:
• Expected valuation or asking price range
• Preferred buyer type — strategic, PE, family office, or open
• Promoter's expected role post-deal
• Timeline or urgency
• Reason for exit (optional — never press if not offered)

Post-qualification (V3 §7): once first block answered, do NOT repeat framework.
Ask only targeted refinements. Shift to Momentum Mode.

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// M3_B — BUY-SIDE
// RC1: intermediary conditional
// ─────────────────────────────────────────────────────────────

const M3_BUY_SIDE = `
## M3: BUY-SIDE QUALIFICATION

INTERMEDIARY QUESTION — conditional on # INTERMEDIARY_ROLE:
  "owner" or "advisor" → SKIP entirely. The role is already known. Never ask.
  "unknown" → Ask as the FIRST LINE of your response (not the only content). One blank line after, then continue with M3 + M4 in the SAME message:
  "Are you the acquirer directly, or an advisor running a mandate on behalf of a client?"
  If advisor: share what the client's mandate covers — ranges are sufficient.
  If direct acquirer: proceed with fields below.

Note: Financial investors deploying capital ("investor mandate", "deploy ₹X Cr") are direct acquirers — use "you", not "your client".

Minimum required fields — ask only those NOT in # FIELDS ALREADY PROVIDED:
• Target industry / sector (sub-sector preferred) [SKIP if sector known]
• Preferred geography — state, region, or pan-India [SKIP if geography known]
• Acquisition budget / ticket size (range acceptable) [SKIP if deal_size known]
• Deal structure — majority acquisition, minority stake, or full buyout? [SKIP if structure known]
• Strategic objective — expansion, synergy, platform acquisition, roll-up, capability buy? [SKIP if intent_focus known]

Ask only when contextually relevant:
• Cross-border openness
• Preferred revenue or EBITDA size of target
• Must-have capabilities, certifications, or approvals in the target
• Timeline or urgency

Post-qualification (V3 §8): avoid repeating structure. Use single refinement questions.

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// M3_C — FUNDRAISING
// RC1: intermediary conditional
// ─────────────────────────────────────────────────────────────

const M3_FUNDRAISING = `
## M3: FUNDRAISING QUALIFICATION

Disambiguation (if equity vs debt not yet clear):
"Are you looking to raise equity (investors taking a stake) or debt (loan / structured finance)?"
Debt → switch to M3_D framework. Equity → proceed below.

INTERMEDIARY QUESTION — conditional on # INTERMEDIARY_ROLE:
  "owner" or "advisor" → SKIP entirely.
  "unknown" → Ask as the FIRST LINE of your response (not the only content). One blank line after, then continue with M3 + M4 in the SAME message:
  "Are you the founder / promoter of the business, or an advisor running this raise?"
  If advisor: teaser-level data and authorised ranges are sufficient.
  If founder: proceed with fields below.

Minimum required fields — ask only those NOT in # FIELDS ALREADY PROVIDED:
• Industry / sector and business stage (early, growth, pre-IPO) [SKIP if known]
• Amount to raise (range acceptable) [SKIP if deal_size known]
• Instrument — equity, CCPS, SAFE, or hybrid? [SKIP if structure known]
• Current revenue scale or ARR [SKIP if revenue known]
• Primary use of funds — expansion, acquisition, working capital, R&D? [SKIP if intent_focus known]

Ask when relevant:
• Preferred investor type — PE, VC, family office, strategic, HNI?
• Existing investors or prior rounds
• Timeline for close
• Valuation expectation (optional — never press)

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// M3_D — DEBT / STRUCTURED FINANCE
// RC1: intermediary conditional
// ─────────────────────────────────────────────────────────────

const M3_DEBT = `
## M3: DEBT / STRUCTURED FINANCE QUALIFICATION

INTERMEDIARY QUESTION — conditional on # INTERMEDIARY_ROLE:
  "owner" or "advisor" → SKIP entirely.
  "unknown" → Ask as the FIRST LINE of your response (not the only content). One blank line after, then continue with M3 + M4 in the SAME message:
  "Are you the business seeking the facility, or an advisor arranging it for a client?"
  If advisor: share what the client's brief covers — amounts and purpose in ranges are fine.
  If direct: proceed with fields below.

Minimum required fields — ask only those NOT in # FIELDS ALREADY PROVIDED:
• Industry / business type [SKIP if sector known]
• Purpose of funding — working capital, capex, acquisition financing, refinancing? [SKIP if known]
• Approximate amount required (range acceptable) [SKIP if deal_size known]
• Current revenue scale [SKIP if revenue known]
• Collateral availability — secured, unsecured, or partial collateral? [SKIP if known]

Ask when relevant:
• Existing banking relationships or current lenders
• Urgency or drawdown timeline
• Preferred tenure
• Any regulatory constraints (NBFC, RBI-governed entities flag early)

Instrument refinement (ask in Momentum phase, not first block):
Bridge / NCD / ECB / WC facility / mezzanine — identify after purpose and amount are clear.

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// M3_E — STRATEGIC PARTNERSHIP
// RC1: intermediary conditional
// ─────────────────────────────────────────────────────────────

const M3_STRATEGIC_PARTNERSHIP = `
## M3: STRATEGIC PARTNERSHIP / JV QUALIFICATION

INTERMEDIARY QUESTION — conditional on # INTERMEDIARY_ROLE:
  "owner" or "advisor" → SKIP entirely.
  "unknown" → Ask as the FIRST LINE of your response (not the only content). One blank line after, then continue with M3 + M4 in the SAME message:
  "Are you representing your own firm, or acting as an advisor facilitating this partnership?"
  If advisor: share what's been scoped — ranges and high-level descriptors are sufficient.
  If direct: proceed with fields below.

Minimum required fields — ask only those NOT in # FIELDS ALREADY PROVIDED:
• Your industry / sector [SKIP if sector known]
• Geography — where you operate and where you seek a partner [SKIP if geography known]
• Partnership type — JV, distribution tie-up, licensing, co-investment, strategic collaboration? [SKIP if known]
• What you bring to the partnership (capability, market access, capital, IP, infrastructure)
• What you are looking for in a partner

Ask when relevant:
• Exclusivity preference — exclusive or non-exclusive?
• Investment willingness — capital contribution expected from both sides?
• Timeline for formalising the arrangement
• Prior partnership attempts in this space

Note: JV specifics (equity split, SPV structure) are Momentum phase refinements.

MANDATORY: After Block 1, add Block 2 from M4 SECTOR INTELLIGENCE. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// MODULE MAP
// ─────────────────────────────────────────────────────────────

export const M3_MODULES: Record<Exclude<DealIntent, null>, string> = {
  SELL_SIDE: M3_SELL_SIDE,
  BUY_SIDE: M3_BUY_SIDE,
  FUNDRAISING: M3_FUNDRAISING,
  DEBT: M3_DEBT,
  STRATEGIC_PARTNERSHIP: M3_STRATEGIC_PARTNERSHIP,
};

// ─────────────────────────────────────────────────────────────
// TOKEN DIAGNOSTICS
// ─────────────────────────────────────────────────────────────

export const M3_DIAGNOSTICS = {
  sub_modules: {
    SELL_SIDE: Math.round(M3_SELL_SIDE.length / 4),
    BUY_SIDE: Math.round(M3_BUY_SIDE.length / 4),
    FUNDRAISING: Math.round(M3_FUNDRAISING.length / 4),
    DEBT: Math.round(M3_DEBT.length / 4),
    STRATEGIC_PARTNERSHIP: Math.round(M3_STRATEGIC_PARTNERSHIP.length / 4),
  },
  loadRule: 'ONE sub-module per request, selected by state.intent',
  perRequestCost: 'one sub-module only (~140–180 tokens)',
} as const;