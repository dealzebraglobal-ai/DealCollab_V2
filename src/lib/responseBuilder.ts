import { IntelligenceState } from "./conversationState";

/**
 * 🛡️ RESPONSE GUARD LAYER
 * Ensures that if the AI returns a weak/empty message, we construct a 
 * system-consistent response based on the RouterState.
 */
export function buildFinalMessage(extraction: Partial<IntelligenceState>): string {
  const s = extraction.state;
  const intent = extraction.intent;
  const aiMessage = extraction.message;
  const isComplete = extraction.is_complete;

  // 1. TRUST AI MESSAGE FIRST (if valid)
  if (aiMessage && aiMessage.length > 30 && !isPlaceholderMessage(aiMessage)) {
    return aiMessage;
  }

  // 2. CLOSURE FALLBACK — only on genuine completion (is_complete is reliable now that the
  // engine controls it). On a normal capture turn the engine already supplies the capture
  // confirmation, so this is only a deep fallback for a weak/empty AI message at completion.
  if (isComplete) {
    return `Your mandate is active and secure with us.

This is deal resolution, not deal distribution. We identify aligned counterparties, validate their intent, and surface only relevant opportunities for your approval.

Aligned counterparties now appear in your Deal Log. We work continuously across the network and will notify you via WhatsApp or email as new matches emerge.`;
  }

  // 3. (REMOVED) The old "momentum synthesizer" fallback used to emit a phase-wrong line
  // ("…strategic operators or financial investors?") from a loose checklist whenever the AI
  // returned an empty message. That produced out-of-stage replies, so it is gone. A weak
  // message now falls through to the safe re-prompt below instead.

  // 4. QUALIFICATION FALLBACK (If AI fails during intake)
  if (intent || s?.sector) {
    const intentStr = intent?.replace('_', ' ') || 'a deal';
    return `I have captured your interest in ${s?.sector || 'the sector'} for ${intentStr}.

To move to the matchmaking phase, I need a few more details:
• Approximate annual revenue or deal size
• Preferred geography
• Transaction structure preference

Your inputs remain confidential and will only be used for precise matchmaking.`;
  }

  // 5. LAST RESORT FALLBACK
  return "Welcome to DealCollab. Please share your requirement — are you looking to buy, sell, or raise funds? Describe your business or target in plain text to begin.";
}

function isPlaceholderMessage(msg: string): boolean {
  const PLACEHOLDER_STRINGS = [
    "your sharp, conversational",
    "mandatory response format",
    "write your actual response",
    "this field must contain",
    "i've updated your deal profile",
    "write your actual",
    "your actual response here",
    "following the mandatory",
  ];
  return PLACEHOLDER_STRINGS.some(p => msg.toLowerCase().includes(p));
}