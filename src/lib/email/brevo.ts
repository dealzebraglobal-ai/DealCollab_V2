export interface BrevoEmailInput {
    toEmail: string;
    toName?: string | null;
    subject: string;
    html: string;
    text: string;
}

export interface BrevoEmailResult {
    providerMessageId: string | null;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not configured`);
    return value;
}

function parseBrevoMessageId(responseBody: unknown): string | null {
    if (!responseBody || typeof responseBody !== 'object') return null;
    const body = responseBody as Record<string, unknown>;
    const messageId = body.messageId ?? body.message_id ?? body.id;
    return typeof messageId === 'string' ? messageId : null;
}

function parseResponseBody(responseText: string): unknown {
    if (!responseText) return null;
    try {
        return JSON.parse(responseText) as unknown;
    } catch {
        return responseText;
    }
}

export async function sendBrevoEmail(input: BrevoEmailInput): Promise<BrevoEmailResult> {
    const apiKey = requireEnv('BREVO_API_KEY');
    const senderEmail = requireEnv('BREVO_SENDER_EMAIL');
    const senderName = process.env.BREVO_SENDER_NAME || 'DealCollab';
    const replyToEmail = process.env.BREVO_REPLY_TO_EMAIL;
    const replyToName = process.env.BREVO_REPLY_TO_NAME || senderName;

    const payload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: input.toEmail, name: input.toName || undefined }],
        replyTo: replyToEmail ? { email: replyToEmail, name: replyToName } : undefined,
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    const responseBody = parseResponseBody(responseText);

    if (!response.ok) {
        const details = responseBody && typeof responseBody === 'object'
            ? JSON.stringify(responseBody)
            : responseText;
        throw new Error(`Brevo email send failed with status ${response.status}: ${details}`);
    }

    return { providerMessageId: parseBrevoMessageId(responseBody) };
}
