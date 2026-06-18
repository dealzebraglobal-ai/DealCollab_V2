/**
 * DealCollab — M5: Matching Layer
 * =================================
 * Match card presentation rules. Loaded when state.is_sufficient=true.
 * Load rule: CONDITIONAL — when is_sufficient=true.
 */

export function buildM5_Matching(matchedMandates: string | null): string {
  if (!matchedMandates || matchedMandates.trim().length === 0) {
    return `## M5: MATCHMAKING — RUNNING
Deliver verbatim:
"Your mandate has been captured. The matchmaking engine is now active — we use semantic intelligence to identify truly aligned counterparties. You will be notified via WhatsApp or email when relevant matches emerge. This runs continuously for 90 days."`.trim();
  }
  return `## M5: MATCH INTELLIGENCE — INDICATIVE PREVIEW
The list below shows ACTIVE counterparties in the user's space. They have NOT been scored.
Precise compatibility is calculated ONLY when the user's mandate is submitted (the scoring engine),
and aligned matches are then surfaced on the user's Deal Dashboard.
${matchedMandates}
Rules:
- Present each as "[Sector] · [Geography] · [Approx Size]" + ONE short sentence on why it may be relevant.
- NEVER state, imply, or invent a compatibility percentage, match score, or strength rating. Use NO numbers.
  If the user asks for a percentage, explain that precise scoring runs when the mandate is submitted.
- Frame these as indicative examples of live demand, NOT confirmed matches.
- Never reveal counterparty identity. Never fabricate any detail beyond what is listed above.
After: "Precise compatibility is computed when you submit your mandate, and aligned matches appear on your Deal Dashboard. To connect, send a connection request there — tokens are deducted only if both parties approve."
Then closure message.`.trim();
}