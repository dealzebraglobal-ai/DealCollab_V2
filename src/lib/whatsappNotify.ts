import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createMagicLinkToken } from './magicLink';
import { sendWhatsAppMatchNotification } from './whatsapp/provider';
import { WhatsAppProvider } from './whatsapp/types';

/**
 * Feature 7 — WhatsApp match notifications.
 * No-ops silently for users without a WhatsApp-verified phone (most web
 * users) — this augments existing in-app notifications, it doesn't replace
 * them.
 */
export async function notifyMatchViaWhatsApp(params: {
  userId: string;
  companySummary: string;
  matchScorePercent: number;
}): Promise<void> {
  const { userId, companySummary, matchScorePercent } = params;

  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.phone || !user.isPhoneVerified) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || 'http://localhost:3000';
    const token = createMagicLinkToken(user.id, user.phone);
    const magicLinkUrl = `${appUrl.replace(/\/$/, '')}/api/auth/magic-link?token=${token}`;

    // Determine provider from user.source (fallback to meta)
    const provider: WhatsAppProvider = user.source === 'whatsapp-wappbiz' ? 'wappbiz' : 'meta';

    const result = await sendWhatsAppMatchNotification(provider, user.phone, {
      companySummary,
      matchScore: matchScorePercent,
      magicLinkUrl,
    });

    if (!result.success) {
      console.error('[whatsappNotify] failed to send match notification:', result.error);
    }
  } catch (err) {
    // Never let a notification failure break the matchmaking flow that triggered it.
    console.error('[whatsappNotify] unexpected error (isolated):', err);
  }
}
