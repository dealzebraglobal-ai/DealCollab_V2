import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db';
import { users, chatSessions, proposalMatches, proposals } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { sendWhatsAppMessage, sendWhatsAppButtons } from '@/lib/whatsapp';
import { getWhatsAppAppSecret } from '@/lib/whatsappConfig';
import { createMagicLinkToken } from '@/lib/magicLink';

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * Without this, anyone who finds this public URL can POST a fabricated
 * "incoming message" payload and have it create users / drive the LLM chat
 * pipeline as if it came from WhatsApp. Signature must be read from the RAW
 * body (before JSON.parse) since Meta signs the exact bytes sent.
 *
 * If WHATSAPP_APP_SECRET isn't configured, this warns and allows the request
 * through rather than hard-failing — that keeps existing deployments working
 * until the secret is added to the environment (see security report).
 */
function isValidWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = getWhatsAppAppSecret();
  if (!appSecret) {
    console.warn('[whatsapp webhook] WHATSAPP_APP_SECRET not set — skipping signature verification (INSECURE, configure this in production).');
    return true;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// GET: Meta Webhook Verification
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WhatsApp Webhook Verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 });
}

// POST: Receive messages from WhatsApp users
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    if (!isValidWhatsAppSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
      console.error('[whatsapp webhook] Invalid or missing X-Hub-Signature-256 — rejecting request.');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Standard Meta Cloud API webhook structure
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            const message = change.value.messages[0];
            const phone = message.from; // Sender's phone (e.g. 919876543210)
            const text = message.text?.body || message.interactive?.button_reply?.id || message.interactive?.button_reply?.title || message.interactive?.list_reply?.id || message.interactive?.list_reply?.title;

            if (!text) continue; // Ignore non-text / non-interactive messages for now

            // Process message asynchronously so we can quickly ack Meta
            processIncomingMessage(phone, text).catch(e => {
              console.error('Failed to process WhatsApp message:', e);
            });
          }
        }
      }
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Fallback for custom testing (direct POST)
    const { phone, message } = body;
    if (phone && message) {
      await processIncomingMessage(phone, message);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  } catch (error) {
    console.error('WhatsApp Webhook Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processIncomingMessage(rawPhone: string, text: string) {
  // Auto-format phone to include '+'
  const cleanedPhone = rawPhone.replace(/[^\d+]/g, '');
  const formattedPhone = cleanedPhone.startsWith('+') ? cleanedPhone : `+${cleanedPhone}`;

  // 1. Find or Create User
  let user = await db.query.users.findFirst({
    where: eq(users.phone, formattedPhone),
  });

  if (!user) {
    console.log(`[WHATSAPP] Creating new user for ${formattedPhone}`);
    const [newUser] = await db.insert(users).values({
      email: `${formattedPhone.replace(/\D/g, '')}@dealcollab.ai`, // Placeholder
      phone: formattedPhone,
      isPhoneVerified: true,
      source: 'whatsapp',
    }).returning();
    user = newUser;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Check if user clicked "Open Website" button or typed web login command
  if (/^(open_?website|website|login|web|portal)\b/i.test(text.trim())) {
    const magicLinkUrl = `${appUrl.replace(/\/$/, '')}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
    const webMsg = 
      `🌐 *Your Secure DealCollab Portal*\n\n` +
      `Your chat mandate and matched counterparties are pre-loaded in your DealLog. Click below to log in instantly (no password needed):\n\n` +
      `👉 ${magicLinkUrl}`;
    await sendWhatsAppMessage(rawPhone, webMsg);
    return;
  }

  // Check if user clicked "View P1", "View P2", or "View P3" buttons
  const viewMatch = text.trim().match(/^view_?p([1-3])/i);
  if (viewMatch) {
    const matchIdx = parseInt(viewMatch[1], 10) - 1; // 0 for P1, 1 for P2, 2 for P3
    const userProposals = await db.query.proposals.findMany({
      where: eq(proposals.userId, user.id),
      orderBy: [desc(proposals.createdAt)],
      limit: 1,
    });

    if (userProposals.length > 0) {
      const latestProp = userProposals[0];
      const matches = await db.query.proposalMatches.findMany({
        where: eq(proposalMatches.proposalId, latestProp.id),
        orderBy: [desc(proposalMatches.finalScore)],
        limit: 3,
      });

      if (matches[matchIdx]) {
        const m = matches[matchIdx];
        const targetProposal = await db.query.proposals.findFirst({
          where: eq(proposals.id, m.matchedProposalId),
        });

        const magicLinkUrl = `${appUrl.replace(/\/$/, '')}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
        const teaserMsg = 
          `🏢 *Counterparty Details — P${matchIdx + 1}*\n\n` +
          `📌 *Title:* ${targetProposal?.summaryText || targetProposal?.normalisedText?.slice(0, 60) || m.matchArchetype || 'Strategic Opportunity'}\n` +
          `🎯 *Match Score:* ${Math.round(Number(m.finalScore))}%\n` +
          `💼 *Sector:* ${targetProposal?.sectors?.join(', ') || 'General Business'}\n` +
          `📍 *Location:* ${targetProposal?.geographies?.join(', ') || 'India'}\n` +
          `💰 *Revenue Range:* ${targetProposal?.revenueMinCr ? '₹' + targetProposal.revenueMinCr + '–' + (targetProposal.revenueMaxCr || '') + ' Cr' : 'Undisclosed'}\n\n` +
          `*Why this matched:* ${m.matchReason}\n\n` +
          `💡 *Next Step:* Click below to view full teaser documents and request a direct introduction on your DealLog:\n` +
          `👉 ${magicLinkUrl}`;

        try {
          await sendWhatsAppButtons(rawPhone, teaserMsg, [
            { id: 'OPEN_WEBSITE', title: '🌐 Open Website' },
            { id: 'START_OVER', title: '🔄 Start Over' },
          ]);
        } catch {
          await sendWhatsAppMessage(rawPhone, teaserMsg);
        }
        return;
      }
    }
    await sendWhatsAppMessage(rawPhone, "❌ We couldn't find the details for that counterparty match. Try checking your full DealLog on the website!");
    return;
  }

  // 2. Find active chat session for this WhatsApp number
  const latestSession = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.whatsappPhoneNumber, formattedPhone),
    orderBy: [desc(chatSessions.createdAt)],
  });

  const isResetCommand = /^(start over|reset|new mandate|clear|restart|new deal)\b/i.test(text.trim());
  const isSessionComplete = latestSession ? (latestSession.state as Record<string, unknown>)?.is_complete === true : false;

  let activeChatId: string | undefined = latestSession ? latestSession.id : undefined;
  let messageToSend = text;

  // If user wants to start over, or if their previous session was already finished/complete,
  // we do NOT attach to the old session! We pass chatId: undefined so /api/chat creates a fresh session.
  if (isResetCommand || isSessionComplete) {
    if (latestSession) {
      console.log(`[WHATSAPP] Session ${latestSession.id} complete or reset requested. Starting fresh session.`);
      await db.update(chatSessions)
        .set({ state: { ...(latestSession.state as Record<string, unknown>), is_complete: true } })
        .where(eq(chatSessions.id, latestSession.id));
    }
    activeChatId = undefined;
    if (isResetCommand) {
      messageToSend = "Hi";
    }
  }

  // 3. Delegate to existing AI Chat Endpoint
  const chatResponse = await fetch(`${appUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': process.env.ADMIN_API_KEY || '',
    },
    body: JSON.stringify({
      userId: user.id,
      message: messageToSend,
      chatId: activeChatId,
      source: 'WHATSAPP',
      channel: 'WHATSAPP',
    }),
  });

  if (!chatResponse.ok) {
    throw new Error(`Chat API failed: ${chatResponse.status}`);
  }

  const aiReply = await chatResponse.json();

  if (aiReply.error) {
    throw new Error(aiReply.error);
  }

  // 4. If a new session was created (or reset triggered), we need to stamp it
  // with our WhatsApp identifier.
  if (!activeChatId) {
    const newLatestSession = await db.query.chatSessions.findFirst({
      where: eq(chatSessions.userId, user.id),
      orderBy: [desc(chatSessions.createdAt)],
    });
    
    if (newLatestSession && !newLatestSession.whatsappPhoneNumber) {
      await db.update(chatSessions)
        .set({ 
          whatsappPhoneNumber: formattedPhone,
          source: 'WHATSAPP' 
        })
        .where(eq(chatSessions.id, newLatestSession.id));
    }
  }

  // 5. Send AI reply back via WhatsApp
  const replyText = typeof aiReply === 'object' && aiReply.message 
    ? aiReply.message 
    : String(aiReply);
    
  await sendWhatsAppMessage(rawPhone, replyText);

  // 6. If matching counterparties were found, format and send them as WhatsApp cards!
  if (typeof aiReply === 'object' && aiReply.proposalId) {
    let matchCards: Array<{ rank?: string; finalScore?: number | string; scoreLabel?: string; archetype?: string; sector?: string; matchReason?: string }> = aiReply.matches || [];
    
    // If not in API response, try checking DB directly
    if (matchCards.length === 0) {
      try {
        const dbMatches = await db.query.proposalMatches.findMany({
          where: eq(proposalMatches.proposalId, aiReply.proposalId),
          orderBy: [desc(proposalMatches.finalScore)],
          limit: 3,
        });
        matchCards = dbMatches.map((m, idx) => ({
          rank: `P${idx + 1}`,
          scoreLabel: Number(m.finalScore) >= 80 ? 'High Confidence' : 'Good Fit',
          finalScore: Number(m.finalScore),
          archetype: m.matchArchetype || 'Strategic Opportunity',
          matchReason: m.matchReason || 'Strong mandate-level alignment',
        }));
      } catch (e) {
        console.error('Failed to fetch DB matches for WhatsApp:', e);
      }
    }

    if (matchCards.length > 0) {
      let matchMessage = `🏢 *Aligned Counterparties (${matchCards.length})*\n\n`;
      matchCards.slice(0, 3).forEach((card: { rank?: string; finalScore?: number | string; scoreLabel?: string; archetype?: string; sector?: string; matchReason?: string }, index: number) => {
        const rank = card.rank || `P${index + 1}`;
        const score = card.finalScore ? ` | Score: ${Math.round(Number(card.finalScore))}%` : '';
        const label = card.scoreLabel || (Number(card.finalScore) >= 80 ? 'High Confidence' : 'Good Fit');
        const title = card.archetype || card.sector || 'Strategic Opportunity';
        const reason = card.matchReason || 'Exact sector and geographic match';

        matchMessage += `*${rank} — ${label}${score}*\n`;
        matchMessage += `📌 *${title}*\n`;
        matchMessage += `• ${reason}\n\n`;
      });
      matchMessage += `💡 _Select a button below to inspect individual counterparty teasers:_`;
      
      // Send matches message with 3 interactive buttons (P1, P2, P3) right after confirmation
      try {
        await sendWhatsAppButtons(rawPhone, matchMessage, [
          { id: 'VIEW_P1', title: '📄 View P1' },
          { id: 'VIEW_P2', title: '📄 View P2' },
          { id: 'VIEW_P3', title: '📄 View P3' },
        ]);
      } catch (e) {
        console.error('Failed to send matches buttons:', e);
        await sendWhatsAppMessage(rawPhone, matchMessage);
      }

      // Send a second interactive message with Start Over and Open Website buttons
      const magicLinkUrl = `${appUrl.replace(/\/$/, '')}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
      const actionMessage = 
        `💡 *What would you like to do next?*\n\n` +
        `You can open your pre-loaded DealLog on the website (instant login without password) or start over with a new mandate:\n\n` +
        `🌐 *Direct Web Portal:* ${magicLinkUrl}`;

      try {
        await sendWhatsAppButtons(rawPhone, actionMessage, [
          { id: 'OPEN_WEBSITE', title: '🌐 Open Website' },
          { id: 'START_OVER', title: '🔄 Start Over' },
        ]);
      } catch (e) {
        console.error('Failed to send action buttons:', e);
        await sendWhatsAppMessage(rawPhone, actionMessage);
      }
    }
  }
}
