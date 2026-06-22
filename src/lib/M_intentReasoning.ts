/**
 * DealCollab — Intent Reasoning
 * ==============================
 * The model determines intent by REASONING about the user's role and the
 * direction of the deal — not by keyword spotting. This is the single source
 * of intent-determination guidance.
 *
 * Load rule: ALWAYS (intent matters on every turn).
 *
 * Owned by this file:
 *   ✔ M_INTENT_REASONING
 *
 * NOT owned:
 *   ✘ Keyword detection (dormant fallback)        → detectors.ts
 *   ✘ Intent persistence / lock enforcement       → stateManager.ts
 *   ✘ Output JSON shape (intent_flavor/_confidence) → M0_outputSchema.ts
 *   ✘ Deterministic opening lines                  → (framing, separate piece)
 */

export const M_INTENT_REASONING = `
# INTENT — REASON, DO NOT PATTERN-MATCH

Decide the user's intent by reasoning about their ROLE and the DIRECTION of the deal, never by
spotting words like "sell", "exit", "fund", or "invest". Ask: relative to the business or asset in
question, what is this party trying to do?

- BUY_SIDE — acquire, invest into, or take a stake in someone else's business OR asset (a strategic
  acquirer, a roll-up, OR a PE/VC fund / financial sponsor deploying capital into targets).
- SELL_SIDE — sell, divest, or exit their OWN business or a stake in it.
- FUNDRAISING — raise capital INTO their own business from investors (equity / growth capital).
- DEBT — borrow or raise structured debt for their own business.
- STRATEGIC_PARTNERSHIP — a JV, alliance, or commercial partnership, with no change of ownership.

## How to resolve intent — apply in THIS order, highest signal wins:
1. EXPLICIT STATEMENT — what the user directly says they want to do.
2. CLIENT'S OBJECTIVE — if the user is an intermediary (advisor, banker, CA, broker) acting for a
   client / principal / promoter / shareholder / investor / lender / acquirer, infer intent from the
   UNDERLYING party's goal, NOT the intermediary's role. "Our client wants to sell a pharma company"
   → SELL_SIDE. "We represent a PE fund seeking acquisitions" → BUY_SIDE. (Independent of
   is_intermediary, which still records advisor vs owner.)
3. CAPITAL-FLOW TEST — who RECEIVES the capital? Into the user's own business → FUNDRAISING. Out of
   the user, into external businesses or assets → BUY_SIDE. "Looking for investors for our company"
   → FUNDRAISING. "Looking to invest in manufacturing businesses" → BUY_SIDE.
4. DEAL NARRATIVE / ACTOR — actions about the TARGET are not the user's intent. "Seeking businesses
   where promoters are exiting" → the user is acquiring → BUY_SIDE.
5. DOCUMENT SHAPE — a detailed, multi-section profile of ONE business (overview + financials +
   products + customers) → the user is presenting their OWN business → SELL_SIDE or FUNDRAISING. A
   short thesis / investment-criteria / requirements note (usually one page) → a BUYER's brief → BUY_SIDE.
6. KEYWORDS — last resort only. Never let a single word override signals 1–5.

## Acquiring an asset is BUY_SIDE
Acquiring a business, asset, licence, brand, plant, shell company, hospital, distribution network,
IP, or business unit is BUY_SIDE — whatever the object. "Looking for an NBFC licence" / "a pharma
manufacturing plant" / "a shell company" → BUY_SIDE.

## Flavor — BUY_SIDE only
- intent_flavor = "financial" — the buyer is a PE/VC fund, financial sponsor, or family office
  deploying capital for returns. Address them in INVESTOR language ("investment", "opportunities"),
  not "buyer".
- intent_flavor = "strategic" — the buyer is an operating company or strategic acquirer.
- Every non-BUY_SIDE intent → intent_flavor = null.

## Confidence and commit
Output intent_confidence (0–100):
- 80–100 — clear; proceed.
- 50–79 — proceed, but stay open to correction.
- 0–49 — do NOT guess: ask ONE short question to establish buy / sell / raise / borrow / partner,
  and use NO intent-specific opening line this turn.
Score 50 or below whenever TWO different intents are both plausible (e.g. "strategic investors" could
be a company raising OR a fund deploying). Always output a one-line intent_rationale naming the role
and direction you inferred. Set intent = null only for a bare greeting with no stated goal.

## Stability
Once intent is set, PRESERVE it. Do not change it because the user later adds financials or business
detail. Change it ONLY when the user EXPLICITLY states a different objective
(e.g. "actually, I want to sell, not buy") — and when you do, set intent_changed = true. Any change
without intent_changed = true will be treated as drift and ignored.
`.trim();
