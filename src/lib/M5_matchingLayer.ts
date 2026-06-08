export function buildM5_Matching(matchedMandates: string | null): string {
  if (!matchedMandates || matchedMandates.trim().length === 0) {
    return `## M5: MATCHMAKING — RUNNING
Deliver verbatim:
"Your mandate has been captured. The matchmaking engine is now active — we use semantic intelligence to identify truly aligned counterparties. You will be notified via WhatsApp or email when relevant matches emerge. This runs continuously for 90 days."`.trim();
  }
  return `## M5: MATCH INTELLIGENCE
${matchedMandates}
Rules: "[Sector] · [Geography] · [Compatibility]" + one sentence. Never reveal identity. Never fabricate. Never present below 40%.
After: "To connect, send a connection request from your Deal Dashboard. Tokens deducted only if both parties approve."
Then closure message.`.trim();
}