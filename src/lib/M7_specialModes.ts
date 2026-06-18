/**
 * DealCollab — M7: Special Modes
 * ================================
 * Conditional override modules that fire for specific system states.
 * These are NOT sector intelligence (M4) or phase rules (M2).
 * They are state-triggered overrides that replace normal qualification flow.
 *
 * Owned by this file:
 *   ✔ M_INTENT_VALIDATION     — fired when phase=INTENT_VALIDATION (NM7)
 *   ✔ buildQualityGateFailModule() — fired when quality gate fails (NM7)
 *   ✔ M_DOCUMENT_INTAKE       — fired when is_document_intake=true (NM6)
 *
 * Load rule: CONDITIONAL — exactly ONE per request, mutually exclusive.
 *   INTENT_VALIDATION phase    → M_INTENT_VALIDATION
 *   quality_gate_attempted=true && !quality_gate_passed → buildQualityGateFailModule(message)
 *   is_document_intake=true && !is_complete → M_DOCUMENT_INTAKE
 */

// ─────────────────────────────────────────────────────────────
// INTENT VALIDATION — NM7
// Replaces the closure message. Asks user to confirm genuine mandate.
// ─────────────────────────────────────────────────────────────

export const M_INTENT_VALIDATION = `
## INTENT VALIDATION — MANDATE CONFIRMATION REQUIRED

Quality threshold has been met. Do NOT deliver the standard closure message.
Do NOT ask any qualification questions.

Deliver this message verbatim:

"Your mandate has been structured. Before we register this as an active requirement in our network, one confirmation:

This is a genuine mandate — your interest is real, the information shared is accurate, and you are prepared to engage with counterparties who respond.

DealCollab operates on trust. Providing misleading information affects how counterparties engage with you, and may impact your visibility on the platform.

Is this a genuine mandate? Reply Yes to activate matching, or No if you're currently exploring."

Set is_complete=false in your JSON. Wait for response.

When user replies YES (or "yes", "confirm", "genuine", "correct", "it is", "absolutely"):
→ Set is_complete=true in your JSON output.

When user replies NO (or "no", "not yet", "exploring", "just looking"):
→ Set is_complete=false. Deliver this message verbatim:
"Understood. Exploratory queries are welcome — this is how many deals begin.
Your session is saved. Return when you're ready to submit a confirmed mandate, and we'll activate matching immediately."
`.trim();

// ─────────────────────────────────────────────────────────────
// QUALITY GATE FAIL — NM7
// Loaded when quality gate attempted but failed.
// message param: ready-to-deliver string from computeQualityGate()
// ─────────────────────────────────────────────────────────────

export function buildQualityGateFailModule(message: string): string {
  return `
## QUALITY GATE — MORE INFORMATION NEEDED

This mandate does not yet meet the minimum threshold to be registered as an active deal.
Do NOT deliver the closure message. Do NOT say "unfortunately" or apologise.
Do NOT ask multiple questions.

Deliver this message verbatim:
"${message}"

Then wait. Ask nothing else this turn.
  `.trim();
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT INTAKE — NM6
// Loaded when is_document_intake=true and is_complete=false.
// ─────────────────────────────────────────────────────────────

export const M_DOCUMENT_INTAKE = `
## DOCUMENT INTAKE MODE
User submitted a structured mandate, investor brief, or detailed description.
Do NOT ask qualification questions.
1. Extract every field silently.
2. Produce clean synthesis confirmation:
"Got it. Here's what I captured:
[Intent] — [Industry] — [Geography if stated] — [Deal size if stated] — [Structure if stated]
[Any other key details: sectors of interest, investment thesis, revenue criteria]
Is this accurate? If yes, I'll proceed to matching. If something's off, let me know what to correct."
3. is_complete=false until user confirms.
4. When user confirms → is_complete=TRUE. No closure message. Matching begins immediately.
`.trim();