import { escapeHtml, renderBaseEmail } from '@/lib/email/html';

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

export function renderEoiReceivedEmail(input: {
    recipientName?: string | null;
    message: string;
    ctaUrl: string;
}): RenderedEmail {
    const name = input.recipientName?.trim() || 'there';
    const safeName = escapeHtml(name);
    const safeMessage = escapeHtml(input.message);

    const subject = 'New Expression of Interest on DealCollab';
    const html = renderBaseEmail({
        title: 'New Expression of Interest',
        previewText: input.message,
        ctaLabel: 'View notification',
        ctaUrl: input.ctaUrl,
        bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi ${safeName},</p>
      <p style="margin:0 0 14px 0;">${safeMessage}</p>
      <p style="margin:0;">Open DealCollab to review the notification and continue the controlled EOI workflow.</p>
    `,
    });

    return {
        subject,
        html,
        text: `Hi ${name},\n\n${input.message}\n\nOpen DealCollab to review the notification: ${input.ctaUrl}`,
    };
}
