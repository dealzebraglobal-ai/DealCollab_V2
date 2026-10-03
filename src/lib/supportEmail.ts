/**
 * DealCollab — Support Email Helpers
 * Provides direct Gmail Web Compose URLs and mailto fallbacks to ensure
 * email actions never fail with blank tabs on desktop browsers like Chrome.
 */

export const SUPPORT_EMAIL = 'join@dealcollab.in';

export function getGmailComposeUrl(subject = 'Support Request', body = ''): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: SUPPORT_EMAIL,
  });
  if (subject) params.set('su', subject);
  if (body) params.set('body', body);
  // Using /u/0/ ensures Gmail does not strip query parameters during account redirects
  return `https://mail.google.com/mail/u/0/?${params.toString()}`;
}

export function getMailtoUrl(subject = 'Support Request', body = ''): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return `mailto:${SUPPORT_EMAIL}${query ? `?${query}` : ''}`;
}

export function openSupportEmail(subject = 'Support Request', body = ''): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Always copy the email address to clipboard so the user has it immediately
  try {
    navigator.clipboard?.writeText(SUPPORT_EMAIL);
  } catch {
    // ignore
  }

  // 2. Open Gmail Web Compose
  const gmailUrl = getGmailComposeUrl(subject, body);
  const win = window.open(gmailUrl, '_blank', 'noopener,noreferrer');

  // 3. Fallback: If popup was blocked or window could not be opened, use mailto:
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = getMailtoUrl(subject, body);
    return false;
  }
  return true;
}
