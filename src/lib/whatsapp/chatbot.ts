import { db } from "@/db";
import { users, chatSessions, proposalMatches, proposals } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createMagicLinkToken } from "@/lib/magicLink";
import { sendWhatsAppMessage, sendWhatsAppButtons } from "./provider";
import { WhatsAppProvider } from "./types";

export async function processIncomingMessage(
  rawPhone: string,
  text: string,
  provider: WhatsAppProvider,
) {
  // Auto-format phone to include '+'
  const cleanedPhone = rawPhone.replace(/[^\d+]/g, "");
  const formattedPhone = cleanedPhone.startsWith("+")
    ? cleanedPhone
    : `+${cleanedPhone}`;

  // 1. Find or Create User
  let user = await db.query.users.findFirst({
    where: eq(users.phone, formattedPhone),
  });

  if (!user) {
    console.log(
      `[WHATSAPP] Creating new user for ${formattedPhone} via ${provider}`,
    );
    const [newUser] = await db
      .insert(users)
      .values({
        email: `${formattedPhone.replace(/\D/g, "")}@dealcollab.ai`, // Placeholder
        phone: formattedPhone,
        isPhoneVerified: true,
        source: provider === "meta" ? "whatsapp" : "whatsapp-wappbiz",
      })
      .returning();
    user = newUser;
  } else if (
    !user.source ||
    user.source === "whatsapp" ||
    user.source === "whatsapp-wappbiz"
  ) {
    // Optionally update source to latest provider if they switched?
    // We'll keep their original source unless we need to update it.
    if (user.source === "whatsapp" && provider === "wappbiz") {
      await db
        .update(users)
        .set({ source: "whatsapp-wappbiz" })
        .where(eq(users.id, user.id));
      user.source = "whatsapp-wappbiz";
    } else if (user.source === "whatsapp-wappbiz" && provider === "meta") {
      await db
        .update(users)
        .set({ source: "whatsapp" })
        .where(eq(users.id, user.id));
      user.source = "whatsapp";
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Check if user clicked "Open Website" button or typed web login command
  if (/^(open_?website|website|login|web|portal)\b/i.test(text.trim())) {
    const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
    const webMsg =
      `🌐 *Your Secure DealCollab Portal*\n\n` +
      `Your chat mandate and matched counterparties are pre-loaded in your DealLog. Click below to log in instantly (no password needed):\n\n` +
      `👉 ${magicLinkUrl}`;
    await sendWhatsAppMessage(provider, rawPhone, webMsg);
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

        const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
        const teaserMsg =
          `🏢 *Counterparty Details — P${matchIdx + 1}*\n\n` +
          `📌 *Title:* ${targetProposal?.summaryText || targetProposal?.normalisedText?.slice(0, 60) || m.matchArchetype || "Strategic Opportunity"}\n` +
          `🎯 *Match Score:* ${Math.round(Number(m.finalScore))}%\n` +
          `💼 *Sector:* ${targetProposal?.sectors?.join(", ") || "General Business"}\n` +
          `📍 *Location:* ${targetProposal?.geographies?.join(", ") || "India"}\n` +
          `💰 *Revenue Range:* ${targetProposal?.revenueMinCr ? "₹" + targetProposal.revenueMinCr + "–" + (targetProposal.revenueMaxCr || "") + " Cr" : "Undisclosed"}\n\n` +
          `*Why this matched:* ${m.matchReason}\n\n` +
          `💡 *Next Step:* Click below to view full teaser documents and request a direct introduction on your DealLog:\n` +
          `👉 ${magicLinkUrl}`;

        try {
          await sendWhatsAppButtons(provider, rawPhone, teaserMsg, [
            { id: "OPEN_WEBSITE", title: "🌐 Open Website" },
            { id: "START_OVER", title: "🔄 Start Over" },
          ]);
        } catch {
          await sendWhatsAppMessage(provider, rawPhone, teaserMsg);
        }
        return;
      }
    }
    await sendWhatsAppMessage(
      provider,
      rawPhone,
      "❌ We couldn't find the details for that counterparty match. Try checking your full DealLog on the website!",
    );
    return;
  }

  // 2. Find active chat session for this WhatsApp number
  const latestSession = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.whatsappPhoneNumber, formattedPhone),
    orderBy: [desc(chatSessions.createdAt)],
  });

  const isResetCommand =
    /^(start over|reset|new mandate|clear|restart|new deal)\b/i.test(
      text.trim(),
    );
  const isSessionComplete = latestSession
    ? (latestSession.state as Record<string, unknown>)?.is_complete === true
    : false;

  let activeChatId: string | undefined = latestSession
    ? latestSession.id
    : undefined;
  let messageToSend = text;

  // If user wants to start over, or if their previous session was already finished/complete,
  // we do NOT attach to the old session! We pass chatId: undefined so /api/chat creates a fresh session.
  if (isResetCommand || isSessionComplete) {
    if (latestSession) {
      console.log(
        `[WHATSAPP] Session ${latestSession.id} complete or reset requested. Starting fresh session.`,
      );
      await db
        .update(chatSessions)
        .set({
          state: {
            ...(latestSession.state as Record<string, unknown>),
            is_complete: true,
          },
        })
        .where(eq(chatSessions.id, latestSession.id));
    }
    activeChatId = undefined;
    if (isResetCommand) {
      messageToSend = "Hi";
    }
  }

  // 3. Delegate to existing AI Chat Endpoint
  const chatResponse = await fetch(`${appUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": process.env.ADMIN_API_KEY || "",
    },
    body: JSON.stringify({
      userId: user.id,
      message: messageToSend,
      chatId: activeChatId,
      source: "WHATSAPP",
      channel: "WHATSAPP",
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
      await db
        .update(chatSessions)
        .set({
          whatsappPhoneNumber: formattedPhone,
          source: provider === "meta" ? "WHATSAPP" : "WHATSAPP-WAPPBIZ",
        })
        .where(eq(chatSessions.id, newLatestSession.id));
    }
  }

  // 5. Send AI reply back via WhatsApp
  const replyText =
    typeof aiReply === "object" && aiReply.message
      ? aiReply.message
      : String(aiReply);

  await sendWhatsAppMessage(provider, rawPhone, replyText);

  // 6. If matching counterparties were found, format and send them as WhatsApp cards!
  if (typeof aiReply === "object" && aiReply.proposalId) {
    let matchCards: Array<{
      rank?: string;
      finalScore?: number | string;
      scoreLabel?: string;
      archetype?: string;
      sector?: string;
      matchReason?: string;
    }> = aiReply.matches || [];

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
          scoreLabel:
            Number(m.finalScore) >= 80 ? "High Confidence" : "Good Fit",
          finalScore: Number(m.finalScore),
          archetype: m.matchArchetype || "Strategic Opportunity",
          matchReason: m.matchReason || "Strong mandate-level alignment",
        }));
      } catch (e) {
        console.error("Failed to fetch DB matches for WhatsApp:", e);
      }
    }

    if (matchCards.length > 0) {
      let matchMessage = `🏢 *Aligned Counterparties (${matchCards.length})*\n\n`;
      matchCards
        .slice(0, 3)
        .forEach(
          (
            card: {
              rank?: string;
              finalScore?: number | string;
              scoreLabel?: string;
              archetype?: string;
              sector?: string;
              matchReason?: string;
            },
            index: number,
          ) => {
            const rank = card.rank || `P${index + 1}`;
            const score = card.finalScore
              ? ` | Score: ${Math.round(Number(card.finalScore))}%`
              : "";
            const label =
              card.scoreLabel ||
              (Number(card.finalScore) >= 80 ? "High Confidence" : "Good Fit");
            const title =
              card.archetype || card.sector || "Strategic Opportunity";
            const reason =
              card.matchReason || "Exact sector and geographic match";

            matchMessage += `*${rank} — ${label}${score}*\n`;
            matchMessage += `📌 *${title}*\n`;
            matchMessage += `• ${reason}\n\n`;
          },
        );
      matchMessage += `💡 _Select a button below to inspect individual counterparty teasers:_`;

      // Send matches message with 3 interactive buttons (P1, P2, P3) right after confirmation
      try {
        await sendWhatsAppButtons(provider, rawPhone, matchMessage, [
          { id: "VIEW_P1", title: "📄 View P1" },
          { id: "VIEW_P2", title: "📄 View P2" },
          { id: "VIEW_P3", title: "📄 View P3" },
        ]);
      } catch (e) {
        console.error("Failed to send matches buttons:", e);
        await sendWhatsAppMessage(provider, rawPhone, matchMessage);
      }

      // Send a second interactive message with Start Over and Open Website buttons
      const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
      const actionMessage =
        `💡 *What would you like to do next?*\n\n` +
        `You can open your pre-loaded DealLog on the website (instant login without password) or start over with a new mandate:\n\n` +
        `🌐 *Direct Web Portal:* ${magicLinkUrl}`;

      try {
        await sendWhatsAppButtons(provider, rawPhone, actionMessage, [
          { id: "OPEN_WEBSITE", title: "🌐 Open Website" },
          { id: "START_OVER", title: "🔄 Start Over" },
        ]);
      } catch (e) {
        console.error("Failed to send action buttons:", e);
        await sendWhatsAppMessage(provider, rawPhone, actionMessage);
      }
    }
  }
}
