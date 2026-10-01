import { escapeHtml, renderBaseEmail } from '@/lib/email/html';

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

export function renderEoiDeclinedEmail(input: {
    recipientName?: string | null;
    message: string;
    ctaUrl: string;
}): RenderedEmail {
    const name = input.recipientName?.trim() || 'there';
    const safeName = escapeHtml(name);
    const safeMessage = escapeHtml(input.message);

    const subject = 'Expression of Interest Update on DealCollab';
    const html = renderBaseEmail({
        title: 'Expression of Interest Declined',
        previewText: input.message,
        ctaLabel: 'View notifications',
        ctaUrl: input.ctaUrl,
        bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi ${safeName},</p>
      <p style="margin:0 0 14px 0;">${safeMessage}</p>
      <p style="margin:0;">Open DealCollab to review your notifications and explore other relevant opportunities.</p>
    `,
    });

    return {
        subject,
        html,
        text: `Hi ${name},\n\n${input.message}\n\nOpen DealCollab: ${input.ctaUrl}`,
    };
}
