import { db } from '@/db';
import { verificationTokens, users, whatsappInboundEvents } from '@/db/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { createAuthVerificationToken } from '@/lib/authVerificationToken';
import { sendWappBizMessage } from '@/lib/whatsapp/wappbiz';

export interface InboundVerificationSession {
  code: string;
  userId?: string;
  email?: string;
  verified: boolean;
  phone?: string;
  verificationToken?: string;
  expiresAt: number;
}

// In-memory cache for ultra-fast response
const memorySessions = new Map<string, InboundVerificationSession>();

const WAPPBIZ_BOT_NUMBER = process.env.WAPPBIZ_PHONE_NUMBER || '919373036910';

export function getBotWhatsAppNumber(): string {
  return WAPPBIZ_BOT_NUMBER.replace(/\D/g, '');
}

/**
 * Generate a clean 6-digit verification code.
 */
function generateCode(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return String(num);
}

/**
 * Initialize an inbound verification session.
 */
export async function createInboundVerification(options?: {
  userId?: string;
  email?: string;
  phone?: string;
}): Promise<{ code: string; waUrl: string; botNumber: string }> {
  const code = generateCode();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  const expiresDate = new Date(expiresAt);

  const session: InboundVerificationSession = {
    code,
    userId: options?.userId,
    email: options?.email,
    verified: false,
    phone: options?.phone,
    expiresAt,
  };

  memorySessions.set(code, session);

  try {
    const identifier = `inbound_otp:${code}`;
    const initialPayload = JSON.stringify({
      verified: false,
      userId: options?.userId,
      email: options?.email,
      phone: options?.phone,
    });

    await db.insert(verificationTokens).values({
      identifier,
      token: initialPayload,
      expires: expiresDate,
    }).onConflictDoNothing();
  } catch (err) {
    console.error('[inboundVerification] DB persist error (continuing with in-memory):', err);
  }

  const botNumber = getBotWhatsAppNumber();
  const textMessage = encodeURIComponent(`Verify DealCollab ${code}`);
  const waUrl = `https://wa.me/${botNumber}?text=${textMessage}`;

  return { code, waUrl, botNumber };
}

/**
 * Check verification status for a code.
 */
export async function checkInboundVerificationStatus(code: string): Promise<{
  verified: boolean;
  phone?: string;
  verificationToken?: string;
}> {
  const cleanCode = code.trim();

  // Check in-memory first
  const mem = memorySessions.get(cleanCode);
  if (mem) {
    if (mem.expiresAt < Date.now()) {
      memorySessions.delete(cleanCode);
      return { verified: false };
    }
    if (mem.verified) {
      return {
        verified: true,
        phone: mem.phone,
        verificationToken: mem.verificationToken,
      };
    }
  }

  // Check DB
  try {
    const identifier = `inbound_otp:${cleanCode}`;
    const rows = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          gt(verificationTokens.expires, new Date())
        )
      );

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.token);
        if (parsed.verified === true) {
          if (mem) {
            mem.verified = true;
            mem.phone = parsed.phone;
            mem.verificationToken = parsed.verificationToken;
          }
          return {
            verified: true,
            phone: parsed.phone,
            verificationToken: parsed.verificationToken,
          };
        }
      } catch {
        // ignore JSON parse error
      }
    }

    // Real-time fallback: Check whatsapp_inbound_events in Postgres for any message containing this code
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const inboundEvents = await db
      .select({
        rawPayload: whatsappInboundEvents.rawPayload,
      })
      .from(whatsappInboundEvents)
      .where(gt(whatsappInboundEvents.createdAt, fifteenMinutesAgo))
      .orderBy(desc(whatsappInboundEvents.createdAt))
      .limit(30);

    for (const ev of inboundEvents) {
      const payload = ev.rawPayload as { data?: { from?: string; text?: { body?: string } } };
      const bodyText = payload?.data?.text?.body || '';
      if (bodyText.includes(cleanCode)) {
        const fromPhone = payload?.data?.from;
        if (fromPhone) {
          const normalizedPhone = normalizeToE164(fromPhone);
          const verificationToken = createAuthVerificationToken({
            type: 'phone',
            value: normalizedPhone,
          });

          if (mem) {
            mem.verified = true;
            mem.phone = normalizedPhone;
            mem.verificationToken = verificationToken;
          }

          return {
            verified: true,
            phone: normalizedPhone,
            verificationToken,
          };
        }
      }
    }
  } catch (err) {
    console.error('[inboundVerification] DB check error:', err);
  }

  return { verified: false };
}

/**
 * Normalize phone to E.164 (+91...)
 */
function normalizeToE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return `+${cleaned}`;
}

/**
 * Match incoming WhatsApp text to a pending verification code.
 * If matched, completes verification, saves to DB, and sends confirmation text back.
 */
export async function handleInboundVerificationMessage(
  fromPhone: string,
  messageText: string
): Promise<{ matched: boolean; phone?: string; code?: string }> {
  if (!messageText) return { matched: false };

  // Match 6 digits anywhere in the message (e.g. "Verify DealCollab 482910" or "482910")
  const match = messageText.match(/\b(\d{6})\b/);
  if (!match) return { matched: false };

  const extractedCode = match[1];
  const identifier = `inbound_otp:${extractedCode}`;
  const normalizedPhone = normalizeToE164(fromPhone);

  console.log(`[inboundVerification] Attempting to match code ${extractedCode} from phone ${normalizedPhone}`);

  const session = memorySessions.get(extractedCode);
  let foundInDb = false;
  let dbUserId: string | undefined;

  if (session && session.expiresAt >= Date.now()) {
    session.verified = true;
    session.phone = normalizedPhone;
    dbUserId = session.userId;
  } else {
    try {
      const rows = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.identifier, identifier),
            gt(verificationTokens.expires, new Date())
          )
        );

      if (rows.length > 0) {
        foundInDb = true;
        try {
          const parsed = JSON.parse(rows[0].token);
          dbUserId = parsed.userId;
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error('[inboundVerification] DB lookup error:', err);
    }
  }

  if (!session && !foundInDb) {
    console.log(`[inboundVerification] Code ${extractedCode} not found or expired`);
    return { matched: false };
  }

  // Generate cryptographically signed verification proof
  const verificationToken = createAuthVerificationToken({
    type: 'phone',
    value: normalizedPhone,
    userId: dbUserId,
  });

  if (session) {
    session.verified = true;
    session.phone = normalizedPhone;
    session.verificationToken = verificationToken;
  }

  // Update DB verificationTokens
  try {
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
    await db.insert(verificationTokens).values({
      identifier,
      token: JSON.stringify({
        verified: true,
        phone: normalizedPhone,
        userId: dbUserId,
        verificationToken,
      }),
      expires: new Date(Date.now() + 15 * 60 * 1000),
    });

    // If userId exists, directly update user in DB
    if (dbUserId) {
      await db
        .update(users)
        .set({
          phone: normalizedPhone,
          isPhoneVerified: true,
        })
        .where(eq(users.id, dbUserId));
      console.log(`[inboundVerification] Linked phone ${normalizedPhone} to user ${dbUserId}`);
    } else {
      // Find or create user by phone
      const existingUser = await db.query.users.findFirst({
        where: eq(users.phone, normalizedPhone),
      });
      if (existingUser) {
        await db
          .update(users)
          .set({ isPhoneVerified: true })
          .where(eq(users.id, existingUser.id));
      }
    }
  } catch (err) {
    console.error('[inboundVerification] DB update error:', err);
  }

  // Deliver free instant confirmation back to user over WhatsApp (24h window is open now!)
  try {
    const confirmationText = `✅ *DealCollab Verification Successful!*\n\nYour WhatsApp number (*${normalizedPhone}*) has been verified. You can now return to your browser to continue.`;
    await sendWappBizMessage(fromPhone, confirmationText);
    console.log(`[inboundVerification] Sent WhatsApp confirmation to ${fromPhone}`);
  } catch (sendErr) {
    console.warn('[inboundVerification] Failed to send confirmation text (non-fatal):', sendErr);
  }

  return { matched: true, phone: normalizedPhone, code: extractedCode };
}
