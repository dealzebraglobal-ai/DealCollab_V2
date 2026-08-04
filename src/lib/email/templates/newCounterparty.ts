import { escapeHtml, renderBaseEmail } from '@/lib/email/html';
import type { RenderedEmail } from '@/lib/email/templates/eoiReceived';

export function renderNewCounterpartyEmail(input: {
    recipientName?: string | null;
    message: string;
    ctaUrl: string;
}): RenderedEmail {
    const name = input.recipientName?.trim() || 'there';
    const safeName = escapeHtml(name);
    const safeMessage = escapeHtml(input.message);

    const subject = 'New counterparty match on DealCollab';
    const html = renderBaseEmail({
        title: 'New counterparty match',
        previewText: 'A new counterparty aligns with one of your active mandates.',
        ctaLabel: 'Review match',
        ctaUrl: input.ctaUrl,
        bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi ${safeName},</p>
      <p style="margin:0 0 14px 0;">${safeMessage}</p>
      <p style="margin:0;">Review the match now. Identity stays protected until the controlled EOI workflow allows disclosure.</p>
    `,
    });

    return {
        subject,
        html,
        text: `Hi ${name},\n\n${input.message}\n\nReview the match now. Identity stays protected until the controlled EOI workflow allows disclosure: ${input.ctaUrl}`,
    };
}
