import { db } from "@/db";
import { users, chatSessions, proposalMatches, proposals } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createMagicLinkToken } from "@/lib/magicLink";
import { runChatTurn } from "@/lib/chatPipeline";
import { sendWhatsAppMessage, sendWhatsAppButtons } from "./provider";
import { WhatsAppProvider } from "./types";
import { classifyWhatsAppCommand, WhatsAppUiScreen } from "./classifyCommand";

type MatchCardLike = {
  rank?: string;
  finalScore?: number | string;
  scoreLabel?: string;
  archetype?: string;
  sector?: string | null;
  matchReason?: string;
};

import { formatMatchScore, normalizeMatchScoreNum } from "@/utils/formatters";

/** Reused by both the initial post-capture display and BACK_TO_PROPOSALS — one renderer, no duplicate format. */
function formatProposalListMessage(matchCards: MatchCardLike[]): string {
  let matchMessage = `🏢 *Aligned Counterparties (${matchCards.length})*\n\n`;
  matchCards.slice(0, 3).forEach((card, index) => {
    const rank = card.rank || `P${index + 1}`;
    const score = card.finalScore ? ` | Score: ${formatMatchScore(card.finalScore)}` : "";
    const label = card.scoreLabel || (normalizeMatchScoreNum(card.finalScore) >= 80 ? "High Confidence" : "Good Fit");
    const title = card.archetype || card.sector || "Strategic Opportunity";
    const reason = card.matchReason || "Exact sector and geographic match";

    matchMessage += `*${rank} — ${label}${score}*\n`;
    matchMessage += `📌 *${title}*\n`;
    matchMessage += `• ${reason}\n\n`;
  });
  matchMessage += `💡 _Select a button below to inspect individual counterparty teasers:_`;
  return matchMessage;
}

async function sendProposalList(provider: WhatsAppProvider, rawPhone: string, matchCards: MatchCardLike[]) {
  const matchMessage = formatProposalListMessage(matchCards);
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
}

/** Fetches the user's latest proposal + its persisted matches — never reruns matching. */
async function fetchLatestProposalMatches(userId: string) {
  const userProposals = await db.query.proposals.findMany({
    where: eq(proposals.userId, userId),
    orderBy: [desc(proposals.createdAt)],
    limit: 1,
  });
  if (userProposals.length === 0) return null;

  const latestProp = userProposals[0];
  const matches = await db.query.proposalMatches.findMany({
    where: eq(proposalMatches.proposalId, latestProp.id),
    orderBy: [desc(proposalMatches.finalScore)],
    limit: 3,
  });
  return { latestProp, matches };
}

async function setWhatsAppUiState(sessionId: string, state: { screen: WhatsAppUiScreen; index?: number } | null) {
  await db.update(chatSessions).set({ whatsappUiState: state }).where(eq(chatSessions.id, sessionId));
}

export async function processIncomingMessage(
  rawPhone: string,
  text: string,
  provider: WhatsAppProvider,
) {
  console.log(`[Wappbiz Chatbot] Inbound message received (provider=${provider})`);

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

  // Find the active chat session early — its whatsapp_ui_state tells us which
  // screen a bare "1"/"2"/"3" reply should be interpreted against.
  const latestSession = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.whatsappPhoneNumber, formattedPhone),
    orderBy: [desc(chatSessions.createdAt)],
  });
  const currentScreen: WhatsAppUiScreen =
    (latestSession?.whatsappUiState as { screen?: WhatsAppUiScreen } | null)?.screen ?? null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const command = classifyWhatsAppCommand(text, currentScreen);
  console.log(`[WAPPBIZ CHAT] detected command: ${command.type} (screen=${currentScreen ?? "none"})`);

  if (command.type === "OPEN_WEBSITE") {
    const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
    const webMsg =
      `🌐 *Your Secure DealCollab Portal*\n\n` +
      `Your chat mandate and matched counterparties are pre-loaded in your DealLog. Click below to log in instantly (no password needed):\n\n` +
      `👉 ${magicLinkUrl}`;
    await sendWhatsAppMessage(provider, rawPhone, webMsg);
    return;
  }

  // Explicit finish/exit intent — ONLY trigger the "what would you like to do
  // next" menu here, in reply to the user actually asking to wrap up. It must
  // never fire automatically just because matches were shown or a
  // counterparty was inspected. This is a DIFFERENT menu from the
  // counterparty-detail screen's navigation options below.
  if (command.type === "FINISH") {
    console.log("[WAPPBIZ CHAT] finish requested — emitting final menu");
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
    return;
  }

  if (command.type === "BACK_TO_PROPOSALS") {
    console.log("[WAPPBIZ CHAT] back to proposals requested");
    const found = await fetchLatestProposalMatches(user.id);
    if (found && found.matches.length > 0) {
      const matchCards: MatchCardLike[] = found.matches.map((m, idx) => ({
        rank: `P${idx + 1}`,
        scoreLabel: Number(m.finalScore) >= 80 ? "High Confidence" : "Good Fit",
        finalScore: Number(m.finalScore),
        archetype: m.matchArchetype || "Strategic Opportunity",
        matchReason: m.matchReason || "Strong mandate-level alignment",
      }));
      await sendProposalList(provider, rawPhone, matchCards);
      if (latestSession) await setWhatsAppUiState(latestSession.id, { screen: "PROPOSAL_LIST" });
    } else {
      await sendWhatsAppMessage(
        provider,
        rawPhone,
        "❌ We couldn't find your proposal list. Try checking your full DealLog on the website!",
      );
    }
    return;
  }

  if (command.type === "VIEW_MATCH") {
    const matchIdx = command.index;
    console.log(`[WAPPBIZ CHAT] selected counterparty index=${matchIdx}, finishRequested=false`);
    const found = await fetchLatestProposalMatches(user.id);

    if (found && found.matches[matchIdx]) {
      const m = found.matches[matchIdx];
      const targetProposal = await db.query.proposals.findFirst({
        where: eq(proposals.id, m.matchedProposalId),
      });

      const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
      const teaserMsg =
        `🏢 *Counterparty Details — P${matchIdx + 1}*\n\n` +
        `📌 *Title:* ${targetProposal?.summaryText || targetProposal?.normalisedText?.slice(0, 60) || m.matchArchetype || "Strategic Opportunity"}\n` +
        `🎯 *Match Score:* ${formatMatchScore(m.finalScore)}\n` +
        `💼 *Sector:* ${targetProposal?.sectors?.join(", ") || "General Business"}\n` +
        `📍 *Location:* ${targetProposal?.geographies?.join(", ") || "India"}\n` +
        `💰 *Revenue Range:* ${targetProposal?.revenueMinCr ? "₹" + targetProposal.revenueMinCr + "–" + (targetProposal.revenueMaxCr || "") + " Cr" : "Undisclosed"}\n\n` +
        `*Why this matched:* ${m.matchReason}\n\n` +
        `💡 *Next Step:* Click below to view full teaser documents and request a direct introduction on your DealLog:\n` +
        `👉 ${magicLinkUrl}`;

      try {
        await sendWhatsAppButtons(provider, rawPhone, teaserMsg, [
          { id: "BACK_TO_PROPOSALS", title: "⬅️ Back to View Proposals" },
          { id: "OPEN_WEBSITE", title: "🌐 Open Website" },
          { id: "START_OVER", title: "🔄 Start Over" },
        ]);
      } catch {
        await sendWhatsAppMessage(provider, rawPhone, teaserMsg);
      }
      if (latestSession) await setWhatsAppUiState(latestSession.id, { screen: "COUNTERPARTY_DETAIL", index: matchIdx });
      return;
    }
    await sendWhatsAppMessage(
      provider,
      rawPhone,
      "❌ We couldn't find the details for that counterparty match. Try checking your full DealLog on the website!",
    );
    return;
  }

  const isResetCommand = command.type === "RESET";

  let activeChatId: string | undefined = latestSession
    ? latestSession.id
    : undefined;
  let messageToSend = text;

  // Only an EXPLICIT reset command starts a fresh session. A mandate being
  // marked complete does NOT mean the WhatsApp conversation is over — the
  // shared pipeline (resolveCompletion.ts's is_captured terminal lock)
  // already handles "mandate captured, user says something else" by keeping
  // the same session and returning a fixed steady-state status line.
  // Force-resetting here on every post-capture message used to wipe that
  // context and restart intake from scratch on any follow-up.
  if (isResetCommand) {
    if (latestSession) {
      console.log(
        `[WHATSAPP] Reset requested for session ${latestSession.id}. Starting fresh session.`,
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
    messageToSend = "Hi";
  }

  // 3. Delegate to the existing chatbot pipeline (src/lib/chatPipeline.ts —
  // the same intake intelligence + matchmaking engine the web chat route
  // uses), in-process. Previously this made an HTTP self-call to /api/chat
  // gated on ADMIN_API_KEY, which added a network hop and a credential
  // dependency for no benefit — runChatTurn is the real entry point.
  console.log("[Wappbiz Chatbot] Conversation resolved, processing started");

  let result;
  try {
    result = await runChatTurn({
      userId: user.id,
      rawMessage: messageToSend,
      channel: "WHATSAPP",
      chatId: activeChatId ?? null,
      whatsappPhoneNumber: formattedPhone,
    });
  } catch (err) {
    console.error("[Wappbiz Chatbot] processing failed:", err instanceof Error ? err.message : err);
    await sendWhatsAppMessage(provider, rawPhone, "Sorry, I couldn't process that right now. Please try again.");
    return;
  }

  console.log("[Wappbiz Chatbot] Response generated");

  // 4. Stamp source once a fresh session exists (runChatTurn already sets
  // whatsapp_phone_number on creation; this only backfills the provider tag).
  await db
    .update(chatSessions)
    .set({ source: provider === "meta" ? "WHATSAPP" : "WHATSAPP-WAPPBIZ" })
    .where(eq(chatSessions.id, result.chatId));

  // 5. Send AI reply back via WhatsApp
  await sendWhatsAppMessage(provider, rawPhone, result.message);
  console.log("[Wappbiz] Response sent");

  // 6. If matching counterparties were found, format and send them as WhatsApp cards!
  if (result.proposalId) {
    let matchCards: MatchCardLike[] = result.matchCards || [];

    // If not returned by the pipeline result, try checking DB directly
    if (matchCards.length === 0) {
      try {
        const dbMatches = await db.query.proposalMatches.findMany({
          where: eq(proposalMatches.proposalId, result.proposalId),
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
      // Deliberately NOT followed by the "what would you like to do next" menu — that is a
      // terminal action menu and must only appear when the user explicitly asks to finish
      // (handled earlier in this function), never automatically after showing matches.
      await sendProposalList(provider, rawPhone, matchCards);
      await setWhatsAppUiState(result.chatId, { screen: "PROPOSAL_LIST" });
    }
  }
}
