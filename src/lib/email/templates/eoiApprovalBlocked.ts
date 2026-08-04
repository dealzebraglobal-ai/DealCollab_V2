import { escapeHtml, renderBaseEmail } from '@/lib/email/html';
import type { RenderedEmail } from '@/lib/email/templates/eoiReceived';

export function renderEoiApprovalBlockedEmail(input: {
    recipientName?: string | null;
    message: string;
    ctaUrl: string;
}): RenderedEmail {
    const name = input.recipientName?.trim() || 'there';
    const safeName = escapeHtml(name);
    const safeMessage = escapeHtml(input.message);

    const subject = 'Action needed: your EOI approval is blocked';
    const html = renderBaseEmail({
        title: 'Your EOI approval is blocked',
        previewText: 'A counterparty tried to approve your EOI, but your token balance needs attention.',
        ctaLabel: 'Top up and unlock',
        ctaUrl: input.ctaUrl,
        bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi ${safeName},</p>
      <p style="margin:0 0 14px 0;">${safeMessage}</p>
      <p style="margin:0;">Top up now so the connection can move forward without losing deal momentum.</p>
    `,
    });

    return {
        subject,
        html,
        text: `Hi ${name},\n\n${input.message}\n\nTop up now so the connection can move forward: ${input.ctaUrl}`,
    };
}
