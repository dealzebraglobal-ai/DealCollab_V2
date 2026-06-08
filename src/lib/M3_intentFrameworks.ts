import type { DealIntent } from './types';

// ─────────────────────────────────────────────────────────────
// SELL-SIDE
// ─────────────────────────────────────────────────────────────

const M3_SELL_SIDE = `
## M3: SELL-SIDE QUALIFICATION — Block 1
INTERMEDIARY: known → skip. Unknown → FIRST LINE then continue.
"Are you the business owner / promoter, or an advisor representing a client?"
REVENUE-FIRST (# REVENUE_REQUIRED): ask ONLY revenue+EBITDA this turn.
COMPACT (# M3_FORMAT: compact): ONE sentence. standard → bullets.
Opening: "To position this correctly for relevant buyers, share:"
\n• What does the business do, and where does it operate? [SKIP if sector + geography known, OR if products_services/capabilities/company_overview in FIELDS ALREADY PROVIDED — any of these alone is sufficient]
\n• What is the approximate annual revenue and EBITDA or profitability range? [SKIP if revenue known]
\n• What kind of transaction — full sale, majority stake, or minority stake? [SKIP if structure or transaction_type in FIELDS ALREADY PROVIDED]
MANDATORY: After Block 1, add Block 2 from M4. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// BUY-SIDE
// ─────────────────────────────────────────────────────────────

const M3_BUY_SIDE = `
## M3: BUY-SIDE QUALIFICATION — Block 1
INTERMEDIARY: known → skip. Unknown → FIRST LINE then continue.
"Are you the acquirer directly, or an advisor running a mandate on behalf of a client?"
COMPACT (# M3_FORMAT: compact): ONE sentence. standard → bullets.
Opening: "To match you with the right target, share:"
\n• What geography are you targeting? [SKIP if geography known]
\n• What is the approximate budget or ticket size? [SKIP if deal_size known]
\n• What deal structure are you looking for? [SKIP if structure known]
\n• What is the strategic rationale behind this acquisition? [SKIP if intent_focus known]
MANDATORY: After Block 1, add Block 2 from M4. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// FUNDRAISING
// ─────────────────────────────────────────────────────────────

const M3_FUNDRAISING = `
## M3: FUNDRAISING QUALIFICATION — Block 1
INTERMEDIARY: known → skip. Unknown → FIRST LINE then continue.
COMPACT (# M3_FORMAT: compact): ONE sentence. standard → bullets.
Opening: "To identify the right investors, share:"
\n• What does the business do, and what stage is it at? [SKIP if known]
\n• How much are you looking to raise, and what will the capital be used for? [SKIP if deal_size known]
\n• What kind of funding structure are you open to? [SKIP if structure known]
\n• What is the current revenue scale or ARR? [SKIP if revenue known]
MANDATORY: After Block 1, add Block 2 from M4. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// DEBT / STRUCTURED FINANCE
// ─────────────────────────────────────────────────────────────

const M3_DEBT = `
## M3: DEBT / STRUCTURED FINANCE QUALIFICATION — Block 1
INTERMEDIARY: known → skip. Unknown → FIRST LINE then continue.
COMPACT (# M3_FORMAT: compact): ONE sentence. standard → bullets.
Opening: "To identify relevant debt providers, share:"
\n• What does the business do, and what is the funding needed for? [SKIP if known]
\n• What is the approximate amount required? [SKIP if deal_size known]
\n• What is the current revenue scale? [SKIP if revenue known]
\n• What is the collateral position? [SKIP if known]
MANDATORY: After Block 1, add Block 2 from M4. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// STRATEGIC PARTNERSHIP
// ─────────────────────────────────────────────────────────────

const M3_STRATEGIC = `
## M3: STRATEGIC PARTNERSHIP QUALIFICATION — Block 1
INTERMEDIARY: known → skip. Unknown → FIRST LINE then continue.
COMPACT (# M3_FORMAT: compact): ONE sentence. standard → bullets.
Opening: "To identify aligned strategic partners, share:"
\n• What does your business do, and where does it operate? [SKIP if sector + geography known]
\n• What kind of partnership or collaboration are you looking for? [SKIP if known]
\n• What does your business bring, and what are you looking for in a partner? [SKIP if known]
MANDATORY: After Block 1, add Block 2 from M4. Same message.
`.trim();

// ─────────────────────────────────────────────────────────────
// MODULE MAP
// ─────────────────────────────────────────────────────────────

export const M3_MODULES: Record<Exclude<DealIntent, null>, string> = {
  SELL_SIDE: M3_SELL_SIDE,
  BUY_SIDE: M3_BUY_SIDE,
  FUNDRAISING: M3_FUNDRAISING,
  DEBT: M3_DEBT,
  STRATEGIC_PARTNERSHIP: M3_STRATEGIC,
};