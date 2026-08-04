import type { SupabaseClient } from '@supabase/supabase-js';
import { sendBrevoEmail } from '@/lib/email/brevo';
import { renderEoiApprovalBlockedEmail } from '@/lib/email/templates/eoiApprovalBlocked';
import { renderEoiApprovedEmail } from '@/lib/email/templates/eoiApproved';
import { renderEoiReceivedEmail, type RenderedEmail } from '@/lib/email/templates/eoiReceived';
import { renderNewCounterpartyEmail } from '@/lib/email/templates/newCounterparty';

const EMAIL_CHANNEL = 'email';
const BREVO_PROVIDER = 'brevo';
const EOI_RECEIVED = 'EOI_RECEIVED';
const EOI_APPROVED = 'EOI_APPROVED';
const EOI_APPROVAL_BLOCKED = 'EOI_APPROVAL_BLOCKED';
const NEW_COUNTERPARTY = 'NEW_COUNTERPARTY';

export interface NotificationRow {
    id: string;
    user_id: string;
    type: string;
    message: string;
    is_read: boolean;
    created_at?: string;
}

interface RecipientRow {
    id: string;
    name: string | null;
    email: string | null;
}

function emailNotificationsEnabled(): boolean {
    return process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function appBaseUrl(): string {
    return (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function isPlaceholderEmail(email: string): boolean {
    return email.trim().toLowerCase().endsWith('@dealcollab.ai');
}

function emailCtaUrl(notificationType: string): string {
    const baseUrl = appBaseUrl();
    if (notificationType === EOI_APPROVAL_BLOCKED) return `${baseUrl}/profile/billing`;
    return `${baseUrl}/notifications`;
}

function renderNotificationEmail(input: {
    notificationType: string;
    recipientName?: string | null;
    message: string;
}): RenderedEmail | null {
    const shared = {
        recipientName: input.recipientName,
        message: input.message,
        ctaUrl: emailCtaUrl(input.notificationType),
    };

    switch (input.notificationType) {
        case EOI_RECEIVED:
            return renderEoiReceivedEmail(shared);
        case EOI_APPROVED:
            return renderEoiApprovedEmail(shared);
        case EOI_APPROVAL_BLOCKED:
            return renderEoiApprovalBlockedEmail(shared);
        case NEW_COUNTERPARTY:
            return renderNewCounterpartyEmail(shared);
        default:
            return null;
    }
}

async function createPendingDelivery(
    supabase: SupabaseClient,
    input: {
        notificationId: string;
        userId: string;
        templateName: string;
    }
): Promise<string | null> {
    const { data, error } = await supabase.from('notification_deliveries').insert([{
        notification_id: input.notificationId,
        user_id: input.userId,
        channel: EMAIL_CHANNEL,
        status: 'pending',
        provider: BREVO_PROVIDER,
        provider_message_id: null,
        template_name: input.templateName,
        retry_count: 0,
        error_message: null,
        attempted_at: null,
        sent_at: null,
    }]).select('id').single();

    if (error) {
        console.error('[NOTIFICATION_DELIVERY] Failed to create pending email delivery:', error);
        return null;
    }

    return typeof data?.id === 'string' ? data.id : null;
}

async function updateDelivery(
    supabase: SupabaseClient,
    input: {
        deliveryId: string | null;
        notificationId: string;
        userId: string;
        status: 'sent' | 'failed' | 'skipped';
        providerMessageId?: string | null;
        errorMessage?: string | null;
        sentAt?: string | null;
    }
): Promise<void> {
    if (!input.deliveryId) {
        console.error('[NOTIFICATION_DELIVERY] Cannot update delivery because no delivery id was created', {
            notificationId: input.notificationId,
            userId: input.userId,
            status: input.status,
        });
        return;
    }

    const { error } = await supabase
        .from('notification_deliveries')
        .update({
            status: input.status,
            provider_message_id: input.providerMessageId ?? null,
            error_message: input.errorMessage ?? null,
            attempted_at: new Date().toISOString(),
            sent_at: input.sentAt ?? null,
        })
        .eq('id', input.deliveryId);

    if (error) {
        console.error('[NOTIFICATION_DELIVERY] Failed to update email delivery:', error);
    }
}

async function deliverTemplatedNotificationEmail(supabase: SupabaseClient, notification: NotificationRow): Promise<void> {
    const deliveryId = await createPendingDelivery(supabase, {
        notificationId: notification.id,
        userId: notification.user_id,
        templateName: notification.type,
    });

    if (!emailNotificationsEnabled()) {
        await updateDelivery(supabase, {
            deliveryId,
            notificationId: notification.id,
            userId: notification.user_id,
            status: 'skipped',
            errorMessage: 'Email notifications are disabled',
        });
        return;
    }

    const { data: recipientData, error: recipientErr } = await supabase
        .from('users')
        .select('id,name,email')
        .eq('id', notification.user_id)
        .single();

    const recipient = recipientData as RecipientRow | null;

    if (recipientErr || !recipient) {
        await updateDelivery(supabase, {
            deliveryId,
            notificationId: notification.id,
            userId: notification.user_id,
            status: 'failed',
            errorMessage: recipientErr?.message || 'Recipient user not found',
        });
        return;
    }

    if (!recipient.email || isPlaceholderEmail(recipient.email)) {
        await updateDelivery(supabase, {
            deliveryId,
            notificationId: notification.id,
            userId: notification.user_id,
            status: 'skipped',
            errorMessage: 'Recipient email is missing or placeholder',
        });
        return;
    }

    const email = renderNotificationEmail({
        notificationType: notification.type,
        recipientName: recipient.name,
        message: notification.message,
    });

    if (!email) {
        await updateDelivery(supabase, {
            deliveryId,
            notificationId: notification.id,
            userId: notification.user_id,
            status: 'skipped',
            errorMessage: `No email template configured for ${notification.type}`,
        });
        return;
    }

    try {
        const result = await sendBrevoEmail({
            toEmail: process.env.EMAIL_TEST_RECIPIENT || recipient.email,
            toName: recipient.name,
            subject: email.subject,
            html: email.html,
            text: email.text,
        });

        await updateDelivery(supabase, {
            deliveryId,
            notificationId: notification.id,
            userId: notification.user_id,
            status: 'sent',
            providerMessageId: result.providerMessageId,
            sentAt: new Date().toISOString(),
        });
    } catch (error: unknown) {
        await updateDelivery(supabase, {
            deliveryId,
            notificationId: notification.id,
            userId: notification.user_id,
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
        });
    }
}

export async function deliverNotificationEmail(
    supabase: SupabaseClient,
    notification: NotificationRow
): Promise<void> {
    try {
        if ([EOI_RECEIVED, EOI_APPROVED, EOI_APPROVAL_BLOCKED, NEW_COUNTERPARTY].includes(notification.type)) {
            await deliverTemplatedNotificationEmail(supabase, notification);
        }
    } catch (error: unknown) {
        // Email delivery must never fail the business action that already created the EOI
        // and in-app notification. Log unexpected delivery failures and let the caller return
        // the original success response.
        console.error('[NOTIFICATION_DELIVERY] Unexpected email delivery failure:', {
            notificationId: notification.id,
            userId: notification.user_id,
            type: notification.type,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
