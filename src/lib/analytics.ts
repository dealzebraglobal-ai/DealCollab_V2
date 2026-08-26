/**
 * DealCollab — Google Analytics 4 event tracking utility
 * =========================================================
 * Client-side only (GA4's gtag.js runs in the browser). Every call is a
 * no-op when GA hasn't loaded (dev/missing env var) or when called from a
 * server component/module — never throws, since analytics must never be
 * able to break a real user-facing action.
 *
 * SAFETY RULE: event params passed here must be non-sensitive metadata only
 * — ids, counts, categories, booleans. Never pass full chatbot message
 * text, document contents, financial figures, phone numbers, emails, OTPs,
 * or other PII/deal-confidential data. Each typed helper below intentionally
 * only accepts the shape of parameters that are safe to send.
 */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined' || !window.gtag) return;
  try {
    window.gtag(...args);
  } catch {
    // Analytics must never break the app.
  }
}

/** Low-level escape hatch — prefer the typed helpers below for anything business-specific. */
export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  gtag('event', eventName, params);
}

export function trackPageView(url: string) {
  if (!GA_MEASUREMENT_ID) return;
  gtag('event', 'page_view', { page_path: url });
}

// ── Authentication ──────────────────────────────────────────────────────
export const trackSignUp = (method: 'google' | 'phone' | 'email' | 'whatsapp') =>
  trackEvent('sign_up', { method });

export const trackLogin = (method: 'google' | 'phone' | 'email' | 'whatsapp') =>
  trackEvent('login', { method });

export const trackLogout = () => trackEvent('logout');

// ── Core DealCollab actions ─────────────────────────────────────────────
export const trackDealView = (dealId: string) => trackEvent('deal_view', { deal_id: dealId });

export const trackDealSearch = (resultCount: number) =>
  trackEvent('deal_search', { result_count: resultCount });

export const trackDealMatchView = (matchId: string, scoreLabel?: string) =>
  trackEvent('deal_match_view', { match_id: matchId, ...(scoreLabel ? { score_label: scoreLabel } : {}) });

export const trackProposalView = (proposalId: string) =>
  trackEvent('proposal_view', { proposal_id: proposalId });

export const trackProposalCreated = (intent: string, sector?: string | null) =>
  trackEvent('proposal_created', { intent, ...(sector ? { sector } : {}) });

export const trackProfileCompleted = (completionPercent: number) =>
  trackEvent('profile_completed', { completion_percent: completionPercent });

export const trackDocumentUploaded = (fileType: string) =>
  trackEvent('document_uploaded', { file_type: fileType });

export const trackDocumentParsed = (success: boolean) =>
  trackEvent('document_parsed', { success });

// ── Chatbot — event metadata only, never message content ────────────────
export const trackChatStarted = (channel: 'WEB' | 'WHATSAPP') => trackEvent('chat_started', { channel });

export const trackChatMessage = (channel: 'WEB' | 'WHATSAPP', turnCount: number) =>
  trackEvent('chat_message', { channel, turn_count: turnCount });

export const trackChatConversion = (channel: 'WEB' | 'WHATSAPP') =>
  trackEvent('chat_conversion', { channel });

// ── Payments / token economy — event metadata only. NEVER pass card
// details, CVV, bank information, Razorpay secrets, API keys, OTPs, or any
// other sensitive financial data — only package/amount/status metadata. ──
export const trackPaymentStarted = (packageId: string) => trackEvent('payment_started', { package_id: packageId });

export const trackPromoCodeAttempted = (packageId: string) => trackEvent('promo_code_attempted', { package_id: packageId });

export const trackPromoCodeApplied = (packageId: string, discountAmountInr: number) =>
  trackEvent('promo_code_applied', { package_id: packageId, discount_amount_inr: discountAmountInr });

export const trackPaymentSuccess = (packageId: string, amountInr: number) =>
  trackEvent('payment_success', { package_id: packageId, amount_inr: amountInr });

export const trackPaymentFailed = (packageId: string, reason?: string) =>
  trackEvent('payment_failed', { package_id: packageId, ...(reason ? { reason } : {}) });

export const trackTokenPurchase = (packageId: string, tokenQuantity: number) =>
  trackEvent('token_purchase', { package_id: packageId, token_quantity: tokenQuantity });

export const trackTokenSpent = (action: string, amount: number) =>
  trackEvent('token_spent', { action, amount });
