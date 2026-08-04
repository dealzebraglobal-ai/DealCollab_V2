export function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function renderBaseEmail(input: {
    title: string;
    previewText: string;
    bodyHtml: string;
    ctaLabel: string;
    ctaUrl: string;
}): string {
    const title = escapeHtml(input.title);
    const previewText = escapeHtml(input.previewText);
    const ctaLabel = escapeHtml(input.ctaLabel);
    const ctaUrl = escapeHtml(input.ctaUrl);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${previewText}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 12px 28px;">
                <p style="margin:0 0 10px 0;color:#f97316;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">DealCollab</p>
                <h1 style="margin:0;color:#111827;font-size:24px;line-height:1.25;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 4px 28px;color:#374151;font-size:15px;line-height:1.65;">
                ${input.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px 28px;">
                <a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">${ctaLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
                You are receiving this email because an important M&amp;A workflow notification was created for your DealCollab account.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
