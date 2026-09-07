import { db } from "@/db";
import { users, chatSessions, proposalMatches, proposals } from "@/db/schema";
import { eq, desc, asc, inArray } from "drizzle-orm";
import { createMagicLinkToken } from "@/lib/magicLink";
import { runChatTurn } from "@/lib/chatPipeline";
import { sendWhatsAppMessage, sendWhatsAppButtons } from "./provider";
import { WhatsAppProvider } from "./types";
import { classifyWhatsAppCommand } from "./classifyCommand";
import {
  selectMatchPage,
  formatProposalListMessage,
  scoreLabelFor,
  firstSentence,
  crRange,
  type WhatsAppUiState,
  type MatchCard as MatchCardLike,
} from "./matchNav";
import { formatMatchScore } from "@/utils/formatters";
import { newWaCtx, waLog, describePgError, type WaCtx } from "./webhookDiagnostics";

const MATCH_PAGE_SIZE = 3;
const MATCH_ROW_FETCH_LIMIT = 12;

type PmRow = typeof proposalMatches.$inferSelect;
type ProposalRow = typeof proposals.$inferSelect;

async function setWhatsAppUiState(sessionId: string, state: WhatsAppUiState | null) {
  await db.update(chatSessions).set({ whatsappUiState: state }).where(eq(chatSessions.id, sessionId));
}

function readUiState(session: { whatsappUiState?: unknown } | null | undefined): WhatsAppUiState {
  const s = (session?.whatsappUiState as Partial<WhatsAppUiState> | null) ?? {};
  return {
    screen: s.screen ?? null,
    index: s.index,
    proposalId: s.proposalId,
    pageMatchIds: Array.isArray(s.pageMatchIds) ? s.pageMatchIds : [],
    shownMatchedProposalIds: Array.isArray(s.shownMatchedProposalIds) ? s.shownMatchedProposalIds : [],
    page: s.page,
  };
}

/**
 * The user's latest proposal + up to 12 of its already-persisted match rows
 * (final_score desc, id asc for a stable tie-break). The matchmaking engine
 * is NEVER re-run here — "show more" is pagination over rows already on disk.
 */
async function fetchLatestProposalWithMatchRows(userId: string, ctx: WaCtx) {
  const t = Date.now();
  const userProposals = await db.query.proposals.findMany({
    where: eq(proposals.userId, userId),
    orderBy: [desc(proposals.createdAt)],
    limit: 1,
  });
  if (userProposals.length === 0) {
    waLog(ctx, "MATCH_QUERY", "SUCCESS", { stageMs: Date.now() - t, proposal: false });
    return null;
  }
  const latestProp = userProposals[0];
  const rows = (await db.query.proposalMatches.findMany({
    where: eq(proposalMatches.proposalId, latestProp.id),
    orderBy: [desc(proposalMatches.finalScore), asc(proposalMatches.id)],
    limit: MATCH_ROW_FETCH_LIMIT,
  })) as PmRow[];
  waLog(ctx, "MATCH_QUERY", "SUCCESS", { stageMs: Date.now() - t, rows: rows.length });
  return { latestProp, rows };
}

/** Load the matched-proposal records for a page in ONE query, keyed by id (never array position). */
async function loadMatchedProposals(ids: string[]): Promise<Map<string, ProposalRow>> {
  if (ids.length === 0) return new Map();
  const rows = (await db.query.proposals.findMany({
    where: inArray(proposals.id, ids),
  })) as ProposalRow[];
  return new Map(rows.map((p) => [p.id, p]));
}

function cardsForPage(pageRows: PmRow[], byId: Map<string, ProposalRow>): MatchCardLike[] {
  return pageRows.map((r, i) => {
    const p = byId.get(r.matchedProposalId);
    return {
      rank: `P${i + 1}`,
      finalScore: Number(r.finalScore),
      scoreLabel: scoreLabelFor(Number(r.finalScore)),
      archetype: r.matchArchetype ?? null,
      sector: p?.sectors?.[0] ?? null,
      city: p?.geographies?.[0] ?? null,
      sizeLabel: crRange(p?.dealSizeMinCr, p?.dealSizeMaxCr) ?? crRange(p?.revenueMinCr, p?.revenueMaxCr),
      structure: p?.dealStructure ?? null,
      summaryLine: firstSentence(p?.summaryText),
      ref: p?.refCode || (r.matchedProposalId ? `#${r.matchedProposalId.slice(-6).toUpperCase()}` : null),
      matchReason: r.matchReason || null,
    };
  });
}

/**
 * Renders one page of counterparties, sends it (interactive buttons carrying
 * the STABLE proposal_matches.id, numbered-text fallback handled by the
 * provider), and persists navigation state so a later "1"/"2"/"3" or a
 * "show more" resolves against the exact rows the user is looking at.
 */
async function sendMatchPage(
  provider: WhatsAppProvider,
  rawPhone: string,
  ctx: WaCtx,
  opts: {
    sessionId?: string;
    proposalId: string;
    pageRows: PmRow[];
    /** The FULL cumulative set of matched_proposal_ids the user has now seen. */
    cumulativeShownMatchedProposalIds: string[];
    page: number;
    remaining: number;
  },
) {
  const tBuild = Date.now();
  const byId = await loadMatchedProposals(opts.pageRows.map((r) => r.matchedProposalId));

  // Diagnostic: the exact candidate set being rendered — for spotting duplicate
  // companies / repeated pages. IDs truncated; no names / contacts / directors.
  opts.pageRows.forEach((r, i) => {
    const p = byId.get(r.matchedProposalId);
    console.log(
      `[MATCH CANDIDATES] p${i + 1} matchRow=${r.id.slice(-8)} proposal=${r.matchedProposalId.slice(-8)} ` +
        `sector=${p?.sectors?.[0] ?? "-"} city=${p?.geographies?.[0] ?? "-"} ` +
        `size=${crRange(p?.dealSizeMinCr, p?.dealSizeMaxCr) ?? "-"} score=${Number(r.finalScore)} ` +
        `archetype=${r.matchArchetype ?? "-"} page=${opts.page}`,
    );
  });
  const uniqueCompanies = new Set(opts.pageRows.map((r) => r.matchedProposalId)).size;
  waLog(ctx, "MATCH_DEDUP", "SUCCESS", { rows: opts.pageRows.length, uniqueCompanies });

  const cards = cardsForPage(opts.pageRows, byId);
  let listMsg = formatProposalListMessage(cards);
  if (opts.remaining > 0) {
    listMsg += `\n\n_${opts.remaining} more available — reply *more*._`;
  }
  const buttons = opts.pageRows.map((r, i) => ({ id: `VIEW_MATCH:${r.id}`, title: `📄 View P${i + 1}` }));
  waLog(ctx, "RESPONSE_BUILD", "SUCCESS", { cards: cards.length, stageMs: Date.now() - tBuild });

  waLog(ctx, "WAPPBIZ_REQUEST", "START", { kind: "match-page", page: opts.page });
  try {
    await sendWhatsAppButtons(provider, rawPhone, listMsg, buttons);
  } catch (e) {
    console.error("Failed to send match page:", e);
    await sendWhatsAppMessage(provider, rawPhone, listMsg);
  }
  ctx.responseSent = true;
  waLog(ctx, "WAPPBIZ_REQUEST", "SUCCESS", { kind: "match-page", page: opts.page });

  if (opts.sessionId) {
    await setWhatsAppUiState(opts.sessionId, {
      screen: "PROPOSAL_LIST",
      proposalId: opts.proposalId,
      pageMatchIds: opts.pageRows.map((r) => r.id),
      shownMatchedProposalIds: Array.from(new Set(opts.cumulativeShownMatchedProposalIds)),
      page: opts.page,
    });
  }
}

export async function processIncomingMessage(
  rawPhone: string,
  text: string,
  provider: WhatsAppProvider,
  providedCtx?: WaCtx,
) {
  const ctx = providedCtx ?? newWaCtx(null, rawPhone);
  console.log(`[Wappbiz Chatbot] Inbound message received (provider=${provider})`);

  // Local send wrappers — every outbound reply flips ctx.responseSent so the
  // webhook route knows whether a safe fallback is still needed on a throw.
  const reply = async (body: string) => {
    waLog(ctx, "WAPPBIZ_REQUEST", "START", { kind: "text" });
    const r = await sendWhatsAppMessage(provider, rawPhone, body);
    ctx.responseSent = true;
    waLog(ctx, "WAPPBIZ_REQUEST", "SUCCESS", { kind: "text" });
    return r;
  };
  const replyButtons = async (body: string, buttons: Array<{ id: string; title: string }>) => {
    waLog(ctx, "WAPPBIZ_REQUEST", "START", { kind: "buttons" });
    try {
      await sendWhatsAppButtons(provider, rawPhone, body, buttons);
    } catch (e) {
      console.error("Failed to send buttons:", e);
      await sendWhatsAppMessage(provider, rawPhone, body);
    }
    ctx.responseSent = true;
    waLog(ctx, "WAPPBIZ_REQUEST", "SUCCESS", { kind: "buttons" });
  };

  // Auto-format phone to include '+'
  const cleanedPhone = rawPhone.replace(/[^\d+]/g, "");
  const formattedPhone = cleanedPhone.startsWith("+")
    ? cleanedPhone
    : `+${cleanedPhone}`;

  // 1. Find or Create User
  waLog(ctx, "USER_LOOKUP", "START");
  let user = await db.query.users.findFirst({
    where: eq(users.phone, formattedPhone),
  });

  if (!user) {
    waLog(ctx, "USER_CREATED", "START");
    console.log(
      `[WHATSAPP] Creating new user for ${formattedPhone} via ${provider}`,
    );
    try {
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
    } catch (err) {
      waLog(ctx, "USER_CREATED", "FAILED", { ...describePgError(err) });
      throw err;
    }
    waLog(ctx, "USER_CREATED", "SUCCESS", { userId: user?.id });
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
    waLog(ctx, "USER_FOUND", "SUCCESS", { userId: user.id });
  } else {
    waLog(ctx, "USER_FOUND", "SUCCESS", { userId: user.id });
  }

  // Find the active chat session early — its whatsapp_ui_state tells us which
  // screen a bare "1"/"2"/"3" reply should be interpreted against.
  waLog(ctx, "CHAT_SESSION_LOOKUP", "START");
  let latestSession;
  try {
    latestSession = await db.query.chatSessions.findFirst({
      where: eq(chatSessions.whatsappPhoneNumber, formattedPhone),
      orderBy: [desc(chatSessions.createdAt)],
    });
  } catch (err) {
    waLog(ctx, "CHAT_SESSION_LOOKUP", "FAILED", { ...describePgError(err) });
    throw err;
  }
  waLog(ctx, "CHAT_SESSION_LOOKUP", "SUCCESS", { hasSession: !!latestSession });
  const uiState = readUiState(latestSession);
  const currentScreen = uiState.screen;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const command = classifyWhatsAppCommand(text, currentScreen);
  waLog(ctx, "INTENT_DETECTED", "SUCCESS", { command: command.type, screen: currentScreen ?? "none" });
  console.log(`[WAPPBIZ CHAT] detected command: ${command.type} (screen=${currentScreen ?? "none"})`);

  if (command.type === "OPEN_WEBSITE") {
    const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
    const webMsg =
      `🌐 *Your Secure DealCollab Portal*\n\n` +
      `Your chat mandate and matched counterparties are pre-loaded in your DealLog. Click below to log in instantly (no password needed):\n\n` +
      `👉 ${magicLinkUrl}`;
    await reply(webMsg);
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
    await replyButtons(actionMessage, [
      { id: "OPEN_WEBSITE", title: "🌐 Open Website" },
      { id: "START_OVER", title: "🔄 Start Over" },
    ]);
    return;
  }

  // ── Deterministic navigation actions — NO LLM call, structured routing ──
  if (
    command.type === "BACK_TO_PROPOSALS" ||
    command.type === "SHOW_MORE" ||
    command.type === "VIEW_MATCH"
  ) {
    const found = await fetchLatestProposalWithMatchRows(user.id, ctx);
    if (!found || found.rows.length === 0) {
      await reply("❌ We couldn't find your counterparty list yet. Try checking your full DealLog on the website.");
      return;
    }
    const { latestProp, rows } = found;
    const rowById = new Map(rows.map((r) => [r.id, r]));

    if (command.type === "VIEW_MATCH") {
      // Resolve the STABLE proposal_matches.id: from the button postback if
      // present, else from the page the user is looking at (never a fresh
      // "top 3 by score" — that opens the wrong company after a page turn).
      let target: PmRow | undefined;
      if (command.matchId) {
        target = rowById.get(command.matchId);
      } else if (command.index >= 0 && uiState.pageMatchIds && uiState.pageMatchIds[command.index]) {
        target = rowById.get(uiState.pageMatchIds[command.index]);
      } else if (command.index >= 0) {
        // Legacy fallback: no page state (e.g. first session after deploy).
        const legacyPage = selectMatchPage(rows, [], MATCH_PAGE_SIZE).page;
        target = legacyPage[command.index];
      }

      if (!target) {
        await reply("Sorry, that option is no longer available. Please choose from the current options, or reply *more*.");
        return;
      }

      const byId = await loadMatchedProposals([target.matchedProposalId]);
      const tp = byId.get(target.matchedProposalId);
      const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
      const teaserMsg =
        `🏢 *Counterparty Details*\n\n` +
        `📌 *Title:* ${tp?.summaryText || tp?.normalisedText?.slice(0, 60) || target.matchArchetype || "Strategic Opportunity"}\n` +
        `🎯 *Match Score:* ${formatMatchScore(target.finalScore)}\n` +
        `💼 *Sector:* ${tp?.sectors?.join(", ") || "General Business"}\n` +
        `📍 *Location:* ${tp?.geographies?.join(", ") || "India"}\n` +
        `💰 *Revenue Range:* ${tp?.revenueMinCr ? "₹" + tp.revenueMinCr + "–" + (tp.revenueMaxCr || "") + " Cr" : "Undisclosed"}\n\n` +
        `*Why this matched:* ${target.matchReason}\n\n` +
        `💡 *Next Step:* Open your DealLog to view full teaser documents and request a direct introduction:\n👉 ${magicLinkUrl}`;

      await replyButtons(teaserMsg, [
        { id: "BACK_TO_PROPOSALS", title: "⬅️ Back to Proposals" },
        { id: "OPEN_WEBSITE", title: "🌐 Open Website" },
        { id: "START_OVER", title: "🔄 Start Over" },
      ]);
      if (latestSession) {
        await setWhatsAppUiState(latestSession.id, {
          ...uiState,
          screen: "COUNTERPARTY_DETAIL",
          proposalId: latestProp.id,
        });
      }
      return;
    }

    const alreadyShown = uiState.shownMatchedProposalIds ?? [];

    // BACK_TO_PROPOSALS → re-show the exact page the user was on (from state);
    // do NOT re-add to the shown set. SHOW_MORE → the next unseen page.
    if (command.type === "BACK_TO_PROPOSALS" && (uiState.pageMatchIds?.length ?? 0) > 0) {
      const pageRows = uiState.pageMatchIds!
        .map((id) => rowById.get(id))
        .filter((r): r is PmRow => !!r);
      if (pageRows.length > 0) {
        const remaining = selectMatchPage(rows, alreadyShown, rows.length).page.length;
        await sendMatchPage(provider, rawPhone, ctx, {
          sessionId: latestSession?.id,
          proposalId: latestProp.id,
          pageRows,
          cumulativeShownMatchedProposalIds: alreadyShown,
          page: uiState.page ?? 1,
          remaining,
        });
        return;
      }
    }

    const priorShown = command.type === "SHOW_MORE" ? alreadyShown : [];
    const { page, remaining } = selectMatchPage(rows, priorShown, MATCH_PAGE_SIZE);

    if (page.length === 0) {
      // No unseen candidates left — never repeat companies, never fabricate.
      await replyButtons(
        "No additional verified matches are available based on your current criteria.",
        [{ id: "BROADEN_CRITERIA", title: "🔎 Broaden Criteria" }],
      );
      if (latestSession) {
        await setWhatsAppUiState(latestSession.id, {
          ...uiState,
          screen: "NO_MORE_MATCHES",
          proposalId: latestProp.id,
        });
      }
      return;
    }

    await sendMatchPage(provider, rawPhone, ctx, {
      sessionId: latestSession?.id,
      proposalId: latestProp.id,
      pageRows: page,
      cumulativeShownMatchedProposalIds: [...priorShown, ...page.map((r) => r.matchedProposalId)],
      page: command.type === "SHOW_MORE" ? (uiState.page ?? 1) + 1 : (uiState.page ?? 1),
      remaining,
    });
    return;
  }

  if (command.type === "BROADEN_CRITERIA") {
    const magicLinkUrl = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link?token=${createMagicLinkToken(user.id, formattedPhone)}`;
    await reply(
      "To broaden your mandate — widen the sector, geography or deal-size range — open your DealLog on the web and edit the mandate filters. New matches surface automatically:\n\n👉 " +
        magicLinkUrl,
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
  waLog(ctx, "AI_REQUEST", "START", { reset: isResetCommand, newSession: !activeChatId });
  try {
    result = await runChatTurn({
      userId: user.id,
      rawMessage: messageToSend,
      channel: "WHATSAPP",
      chatId: activeChatId ?? null,
      whatsappPhoneNumber: formattedPhone,
    });
  } catch (err) {
    waLog(ctx, "AI_REQUEST", "FAILED", { ...describePgError(err) });
    console.error("[Wappbiz Chatbot] processing failed:", err instanceof Error ? err.message : err);
    await reply("Sorry, I couldn't process that right now. Please try again.");
    return;
  }
  waLog(ctx, "AI_REQUEST", "SUCCESS", { isComplete: result.isComplete, hasProposal: !!result.proposalId });

  console.log("[Wappbiz Chatbot] Response generated");

  // 4. Stamp source once a fresh session exists (runChatTurn already sets
  // whatsapp_phone_number on creation; this only backfills the provider tag).
  await db
    .update(chatSessions)
    .set({ source: provider === "meta" ? "WHATSAPP" : "WHATSAPP-WAPPBIZ" })
    .where(eq(chatSessions.id, result.chatId));

  // 5. Send AI reply back via WhatsApp
  await reply(result.message);
  console.log("[Wappbiz] Response sent");

  // 6. If matching counterparties were found, send page 1 of the persisted
  //    match rows. Reads the same proposal_matches table "show more" pages —
  //    so the exclusion set stays consistent from the very first page.
  if (result.proposalId) {
    const tMatch = Date.now();
    let rows: PmRow[] = [];
    try {
      rows = (await db.query.proposalMatches.findMany({
        where: eq(proposalMatches.proposalId, result.proposalId),
        orderBy: [desc(proposalMatches.finalScore), asc(proposalMatches.id)],
        limit: MATCH_ROW_FETCH_LIMIT,
      })) as PmRow[];
    } catch (e) {
      console.error("Failed to fetch DB matches for WhatsApp:", e);
    }
    waLog(ctx, "MATCH_QUERY", "SUCCESS", { stageMs: Date.now() - tMatch, rows: rows.length });

    const { page, remaining } = selectMatchPage(rows, [], MATCH_PAGE_SIZE);
    if (page.length > 0) {
      // Deliberately NOT followed by the "what would you like to do next" menu — that is a
      // terminal action menu and must only appear when the user explicitly asks to finish.
      await sendMatchPage(provider, rawPhone, ctx, {
        sessionId: result.chatId,
        proposalId: result.proposalId,
        pageRows: page,
        cumulativeShownMatchedProposalIds: page.map((r) => r.matchedProposalId),
        page: 1,
        remaining,
      });
    }
  }
}
