import { auth } from '@/auth';
import { db } from '@/db';
import { chatSessions, mandates } from '@/db/schema';
import { processIntelligence } from '@/lib/intelligenceEngine';
import { normalizeMessage } from '@/lib/normalizeMessage';
import {
  buildSystemPrompt,
  createBlankState,
  detectIntentFromText,
  detectSectorFromText,
  detectIntermediaryFromText,
  detectShellCompanyFromText,
  detectStructureFromText,
  detectDealSizeFromText,
  detectRevenueFromText,
  detectFrictionSignal,
  updateStateFromExtraction,
  type DealIntent,
  type RouterState
} from '@/lib/promptRouter';
import { buildFinalMessage } from '@/lib/responseBuilder';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { and, arrayOverlaps, desc, eq, not } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/**
 * DealCollab Chat Route
 * =====================
 * BASE: repo v4.0 structure preserved exactly
 *   - NextResponse.json (not Response.json)
 *   - try/catch around processIntelligence with 502 fallback
 *   - mandates imported at top from @/db/schema
 *   - resolvedDealSize logic retained
 *
 * SESSION FIXES ADDED:
 *
 * RC1 — Intermediary pre-detected every turn
 *   detectIntermediaryFromText() runs on every message. Catches semantic
 *   patterns: "one of client", "investment banker for my client",
 *   "i am promoter" (without "the").
 *   candidateState.is_intermediary set before prompt builds so
 *   # INTERMEDIARY_ROLE is always correct.
 *
 * RC2 — Structure, size, revenue pre-detected from rich messages
 *   detectStructureFromText(), detectDealSizeFromText(), detectRevenueFromText()
 *   seed candidateState before buildSystemPrompt(). # FIELDS ALREADY PROVIDED
 *   is populated on turn 1, LLM skips known fields.
 *
 * RC3 — Friction hard override (3-layer guarantee)
 *   Layer 1: detectFrictionSignal() in updateStateFromExtraction
 *   Layer 2: route.ts detects friction BEFORE prompt build → patches storedState to CLOSURE
 *   Layer 3: After extraction → forces is_complete=true on updatedState
 *
 * RC8 — 4-turn server-side auto-close
 *   After turn_count reaches 4 with deal context, forces CLOSURE.
 *   resolvePhase() in promptRouter also handles this (belt-and-suspenders).
 *
 * RC9 — Shell company pre-detected server-side
 *   detectShellCompanyFromText() runs on every message. Sets sub_sector='shell_company'.
 *   buildSystemPrompt() then loads M4_SHELL instead of sector M4.
 */

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    // Fetch DB ID by email (mismatch fix)
    const { data: dbUser, error: fetchErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.user.email)
      .single();

    if (fetchErr || !dbUser) {
      console.warn("User not found in DB for history fetch:", session.user.email);
      return NextResponse.json([]);
    }

    const history = await db.query.chatSessions.findMany({
      where: eq(chatSessions.userId, dbUser.id),
      orderBy: [desc(chatSessions.createdAt)],
    });

    return NextResponse.json(history);
  } catch (error: unknown) {
    const err = error as Error;
    console.error("🔥 HISTORY FETCH ERROR:", err);
    return NextResponse.json({ success: false, error: err.message, stack: err.stack }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    console.error("❌ CRITICAL: Missing GROQ_API_KEY");
    throw new Error("GROQ_API_KEY not found in runtime");
  }
  const apiKey = process.env.GROQ_API_KEY;
  console.log("KEY EXISTS:", !!apiKey);

  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const rawMessage = body.message || "";
    const message = normalizeMessage(rawMessage);

    let documentText = body.document || body.documentText || "";
    const documentUrl = body.documentUrl || "";
    const documentId = body.documentId;
    let activeChatId = body.chatId;

    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    // ─── USER RESOLUTION ─────────────────────────────────────
    let userId = session.user.id;

    const { data: dbUser, error: userCheckErr } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (userCheckErr || !dbUser) {
      console.log("User ID mismatch or missing in public.users, attempting email lookup...");
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id")
        .eq("email", session.user.email)
        .single();

      if (userByEmail) {
        userId = userByEmail.id;
      } else {
        const { data: newUser } = await supabase
          .from("users")
          .upsert({
            email: session.user.email,
            name: session.user.name || session.user.email?.split('@')[0]
          }, { onConflict: 'email' })
          .select('id')
          .single();
        if (newUser) userId = newUser.id;
        else throw new Error("Could not resolve valid user_id for chat persistence");
      }
    }

    // ─── STATE LOADING ────────────────────────────────────────
    let storedState: RouterState = createBlankState();

    if (!activeChatId && (documentId || body.documentId)) {
      const docIdToSearch = documentId || body.documentId;
      console.log(`[STATE] No activeChatId, searching for seeded session with documentId: ${docIdToSearch}`);
      const { data: seededSession } = await supabase
        .from("chat_sessions")
        .select("id, state")
        .eq("document_id", docIdToSearch)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (seededSession) {
        activeChatId = seededSession.id;
        storedState = {
          ...createBlankState(),
          ...(seededSession.state as unknown as Partial<RouterState> || {})
        };
        console.log(`[STATE] Recovered seeded session: ${activeChatId} | Phase: ${storedState.phase}`);
      }
    }

    if (activeChatId) {
      console.log(`[STATE] Loading existing session: ${activeChatId}`);
      const { data: existingSession } = await supabase
        .from("chat_sessions")
        .select("id, document_id, state")
        .eq("id", activeChatId)
        .single();

      if (!existingSession) {
        console.log("[STATE] Provided chatId not found.");
        activeChatId = null;
      } else {
        storedState = {
          ...createBlankState(),
          ...(existingSession.state as unknown as Partial<RouterState> || {})
        };
        console.log(`[STATE] Phase: ${storedState.phase} | turn: ${storedState.turn_count} | intermediary: ${storedState.is_intermediary} | sub_sector: ${storedState.sub_sector}`);
      }
    }

    if (!activeChatId) {
      console.log("[STATE] Creating fresh session for user:", userId);
      const { data: newSession, error: sessionErr } = await supabase
        .from("chat_sessions")
        .insert([{
          user_id: userId,
          document_id: documentId || null,
          title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
          state: storedState
        }])
        .select()
        .single();
      if (sessionErr) throw new Error(sessionErr.message);
      activeChatId = newSession.id;
    }

    // ─── DOCUMENT RESTORATION ─────────────────────────────────
    if (!documentText && activeChatId) {
      console.log(`[PERSISTENCE] Attempting to restore document context for chat: ${activeChatId}`);
      const { data: sessionDoc } = await supabase
        .from('chat_sessions')
        .select('document_id')
        .eq('id', activeChatId)
        .maybeSingle();

      const docId = documentId || sessionDoc?.document_id;
      if (docId) {
        const { data: doc } = await supabase
          .from('documents')
          .select('extracted_text')
          .eq('id', docId)
          .maybeSingle();
        if (doc?.extracted_text) {
          documentText = doc.extracted_text;
          console.log(`[PERSISTENCE] Successfully restored context from DB (${documentText.length} chars)`);
        }
      }
    }

    // ─── RC3: FRICTION HARD OVERRIDE (before prompt build) ───
    const hasFriction = detectFrictionSignal(message);
    if (hasFriction) {
      console.log('[ROUTE] Friction detected — patching to CLOSURE before prompt build.');
      storedState = { ...storedState, is_complete: true, phase: 'CLOSURE' };
    }

    // ─── PERSIST USER MESSAGE ─────────────────────────────────
    await supabase.from("chat_messages").insert([{
      chat_id: activeChatId,
      role: 'user',
      content: message,
    }]);

    // ─── FETCH HISTORY ────────────────────────────────────────
    const { data: history } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", activeChatId)
      .order("created_at", { ascending: true });

    const formattedHistory = (history || []).map(h => {
      let content = h.content;
      if (h.role === 'assistant') {
        try {
          const parsed = JSON.parse(h.content);
          content = parsed.message || h.content;
        } catch { }
      }
      return { role: h.role as "user" | "assistant" | "system", content };
    });

    // ─── MATCHMAKING ENGINE ───────────────────────────────────
    let matchedMandatesStr = "No active mandates found in database yet.";

    if (storedState.sector || storedState.intent) {
      try {
        console.log(`[MATCHMAKING] Querying for Sector: ${storedState.sector} | Intent: ${storedState.intent}`);
        const targetIntent = storedState.intent === 'SELL_SIDE' ? 'BUY_SIDE' :
          storedState.intent === 'BUY_SIDE' ? 'SELL_SIDE' : null;

        const results = await db.query.mandates.findMany({
          where: and(
            eq(mandates.status, 'ACTIVE'),
            not(eq(mandates.userId, userId)),
            targetIntent ? eq(mandates.intent, targetIntent) : undefined,
            storedState.sector ? arrayOverlaps(mandates.sectors, [storedState.sector]) : undefined
          ),
          limit: 3
        });

        if (results && results.length > 0) {
          matchedMandatesStr = results.map(r =>
            `- [${r.intent}] ${r.sectors?.join(", ")} | Size: ${r.dealSizeMinCr}-${r.dealSizeMaxCr} Cr | Geography: ${r.geographies?.join(", ")}`
          ).join("\n");
          console.log(`[MATCHMAKING] Found ${results.length} matches.`);
        }
      } catch (matchErr) {
        console.error("❌ MATCHMAKING FAILED (Isolating):", matchErr);
      }
    }

    // ─── PRE-DETECTION ────────────────────────────────────────
    const candidateState: RouterState = { ...storedState };

    if (!candidateState.intent) {
      const detectedIntent = detectIntentFromText(message);
      if (detectedIntent) {
        candidateState.intent = detectedIntent;
        console.log(`[PRE-DETECT] Intent: ${detectedIntent}`);
      }
    }

    if (!candidateState.sector) {
      const detectedSector = detectSectorFromText(message);
      if (detectedSector) {
        candidateState.sector = detectedSector;
        console.log(`[PRE-DETECT] Sector: ${detectedSector}`);
      }
    }

    // RC1: Intermediary detected every turn
    if (candidateState.is_intermediary === null) {
      const detectedRole = detectIntermediaryFromText(message);
      if (detectedRole) {
        candidateState.is_intermediary = detectedRole;
        console.log(`[PRE-DETECT] Intermediary: ${detectedRole}`);
      }
    }

    // RC9: Shell company detection
    if (candidateState.sub_sector === null && detectShellCompanyFromText(message)) {
      candidateState.sub_sector = 'shell_company';
      console.log('[PRE-DETECT] Shell company — sub_sector=shell_company');
    }

    // RC2: Pre-detect structure, size, revenue from rich messages
    if (!candidateState.structure) {
      const s = detectStructureFromText(message);
      if (s) { candidateState.structure = s; console.log(`[PRE-DETECT] Structure: ${s}`); }
    }
    if (!candidateState.deal_size) {
      const ds = detectDealSizeFromText(message);
      if (ds) { candidateState.deal_size = ds; console.log(`[PRE-DETECT] Deal size: ${ds}`); }
    }
    if (!candidateState.revenue) {
      const rv = detectRevenueFromText(message);
      if (rv) { candidateState.revenue = rv; console.log(`[PRE-DETECT] Revenue: ${rv}`); }
    }

    // ─── BUILD SYSTEM PROMPT ──────────────────────────────────
    const { systemPrompt, modulesLoaded, tokenEstimate } = buildSystemPrompt(
      candidateState,
      matchedMandatesStr
    );
    console.log(`[ROUTER] Modules: ${modulesLoaded.join(', ')} | ~${tokenEstimate} tokens`);

    // ─── AI PROCESSING ────────────────────────────────────────
    const startTime = Date.now();
    let extraction: {
      intent: DealIntent;
      state: Partial<RouterState>;
      is_complete: boolean;
      message: string;
    };

    try {
      const raw = await processIntelligence(message, formattedHistory, documentText, systemPrompt);

      if (typeof raw === 'string') {
        const trimmed = (raw as string).trim();
        if (trimmed.startsWith('<') || trimmed.length === 0) {
          throw new Error(`processIntelligence returned non-JSON: ${trimmed.slice(0, 80)}`);
        }
      }

      extraction = raw as typeof extraction;

      if (!extraction || typeof extraction !== 'object' || !('message' in extraction)) {
        throw new Error('processIntelligence returned malformed response — missing "message" field');
      }
    } catch (aiErr) {
      console.error('❌ AI PROCESSING FAILED:', aiErr);
      return NextResponse.json({
        success: false,
        error: 'The AI processing step failed. Please try again.',
        details: aiErr instanceof Error ? aiErr.message : String(aiErr),
      }, { status: 502 });
    }

    const aiContent = JSON.stringify(extraction);
    const duration = (Date.now() - startTime) / 1000;
    console.log(`[AI] Processing completed in ${duration.toFixed(1)}s`);
    console.log("🧠 FINAL DATA:", aiContent);

    // ─── STATE UPDATE ─────────────────────────────────────────
    const updatedState = updateStateFromExtraction(
      storedState,
      extraction as unknown as { intent: DealIntent; state: Partial<RouterState>; is_complete: boolean },
      message,
      modulesLoaded
    );

    // Persist pre-detected values the LLM may not have re-extracted
    if (updatedState.is_intermediary === null && candidateState.is_intermediary !== null) {
      updatedState.is_intermediary = candidateState.is_intermediary;
    }
    if (!updatedState.sub_sector && candidateState.sub_sector) {
      updatedState.sub_sector = candidateState.sub_sector;
    }
    if (!updatedState.structure  && candidateState.structure)  updatedState.structure  = candidateState.structure;
    if (!updatedState.deal_size  && candidateState.deal_size)  updatedState.deal_size  = candidateState.deal_size;
    if (!updatedState.revenue    && candidateState.revenue)    updatedState.revenue    = candidateState.revenue;

    // RC3: Friction hard override (layer 3)
    if (hasFriction) {
      updatedState.is_complete = true;
      updatedState.phase = 'CLOSURE';
      (extraction as Record<string, unknown>).is_complete = true;
      console.log('[ROUTE] Friction override applied: is_complete=true, phase=CLOSURE');
    }

    // RC8: 4-turn server-side auto-close
    if (updatedState.turn_count >= 4 &&
        (updatedState.intent || updatedState.sector) &&
        !updatedState.is_complete) {
      updatedState.is_complete = true;
      updatedState.phase = 'CLOSURE';
      (extraction as Record<string, unknown>).is_complete = true;
      console.log(`[ROUTE] 4-turn auto-close at turn ${updatedState.turn_count}`);
    }

    // Phase lock: stay in MOMENTUM unless complete
    if (storedState.phase === 'MOMENTUM' && updatedState.phase !== 'CLOSURE' && !updatedState.is_complete) {
      updatedState.phase = 'MOMENTUM';
      updatedState.is_sufficient = true;
    }

    // ─── PERSIST ASSISTANT RESPONSE ──────────────────────────
    const { error: assistantMsgErr } = await supabase
      .from("chat_messages")
      .insert([{
        chat_id: activeChatId,
        role: 'assistant',
        content: JSON.stringify(extraction),
      }]);

    if (assistantMsgErr) {
      console.error("Supabase error:", assistantMsgErr);
      throw new Error(assistantMsgErr.message);
    }

    await supabase
      .from('chat_sessions')
      .update({ state: updatedState })
      .eq('id', activeChatId);

    // ─── DEAL PERSISTENCE ─────────────────────────────────────
    const s = extraction.state;
    const isComplete = updatedState.is_complete;

    console.log("🧠 FINAL DATA:", JSON.stringify(extraction));

    const resolvedDealSize =
      s.deal_size ||
      s.revenue ||
      (s.industry_data?.capacity as string) ||
      (s.industry_data?.installed_capacity as string) ||
      null;

    if (isComplete) {
      console.log("✅ DATA COMPLETE - INSERTING INTO DB");
      try {
        const parseRange = (val: string | null) => {
          if (!val) return { min: null, max: null };
          const rangeMatch = val.match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/i);
          if (rangeMatch) return { min: rangeMatch[1], max: rangeMatch[2] };
          const singleMatch = val.match(/~?(\d+(?:\.\d+)?)/);
          if (singleMatch) return { min: singleMatch[1], max: singleMatch[1] };
          return { min: null, max: null };
        };

        const size = parseRange(resolvedDealSize);
        const revenue = parseRange((s.revenue || s.deal_size) ?? null);

        const { error: mandateErr } = await supabase
          .from("mandates")
          .insert([{
            user_id: userId,
            raw_text: message,
            normalised_text: JSON.stringify(extraction),
            intent: extraction.intent,
            sectors: s.sector ? [s.sector] : [],
            geographies: s.geography ? [s.geography] : [],
            deal_size_min_cr: size.min,
            deal_size_max_cr: size.max,
            revenue_min_cr: revenue.min,
            revenue_max_cr: revenue.max,
            deal_structure: s.structure,
            special_conditions: s.industry_data ? [JSON.stringify(s.industry_data)] : [],
            urgency: "Medium",
            buyer_type: s.intent_focus || "Strategic",
            status: 'ACTIVE',
            source: 'WEB',
            document_url: documentUrl,
            document_text: documentText,
          }]);

        if (mandateErr) {
          console.error("Supabase mandate error:", mandateErr);
          throw new Error(mandateErr.message);
        }

        const { error: dealErr } = await supabase
          .from("deals")
          .insert([{
            user_id: userId,
            title: `${extraction.intent}: ${s.sector} deal`,
            sector: s.sector,
            region: s.geography,
            size: s.deal_size || "Undisclosed",
            status: 'live',
          }]);

        if (dealErr) {
          console.error("Supabase deal error:", dealErr);
          throw new Error(dealErr.message);
        }

        console.log("✅ DB INSERT SUCCESSFUL");
      } catch (dbErr) {
        console.error("❌ DB INSERT FAILED:", dbErr);
      }
    } else {
      console.log("⏳ DATA INCOMPLETE - WAITING FOR MORE DETAILS");
    }

    const finalMessage = buildFinalMessage(extraction);

    console.log(`[DEBUG] ${storedState.phase}→${updatedState.phase} | intermediary:${updatedState.is_intermediary} | sub_sector:${updatedState.sub_sector} | m4_asked:${updatedState.m4_questions_asked} | friction:${hasFriction}`);
    console.log(`[DEBUG] System Prompt Length: ${systemPrompt.length} chars`);
    console.log(`[DEBUG] Final Message: ${finalMessage.slice(0, 50)}...`);

    return NextResponse.json({
      success: true,
      data: aiContent,
      message: finalMessage,
      is_complete: isComplete,
      chatId: activeChatId,
      type: isComplete ? 'complete' : 'conversation'
    });

  } catch (error: unknown) {
    console.error("❌ CHAT ERROR:", error);

    let errorMessage = "An unknown error occurred";
    let errorStack = undefined;

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
      console.error("STACK:", errorStack);
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
      stack: errorStack
    }, { status: 500 });
  }
}
