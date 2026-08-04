import { escapeHtml, renderBaseEmail } from '@/lib/email/html';
import type { RenderedEmail } from '@/lib/email/templates/eoiReceived';

export function renderEoiApprovedEmail(input: {
    recipientName?: string | null;
    message: string;
    ctaUrl: string;
}): RenderedEmail {
    const name = input.recipientName?.trim() || 'there';
    const safeName = escapeHtml(name);
    const safeMessage = escapeHtml(input.message);

    const subject = 'Your EOI was approved — act now';
    const html = renderBaseEmail({
        title: 'Your EOI was approved',
        previewText: 'A counterparty approved your Expression of Interest. Open DealCollab to continue.',
        ctaLabel: 'Open approved EOI',
        ctaUrl: input.ctaUrl,
        bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi ${safeName},</p>
      <p style="margin:0 0 14px 0;">${safeMessage}</p>
      <p style="margin:0;">This is an active deal signal. Review the approval and take the next step while momentum is fresh.</p>
    `,
    });

    return {
        subject,
        html,
        text: `Hi ${name},\n\n${input.message}\n\nThis is an active deal signal. Review the approval and take the next step: ${input.ctaUrl}`,
    };
}
