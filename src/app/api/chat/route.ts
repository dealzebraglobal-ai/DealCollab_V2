import { auth } from '@/auth';
import { db } from '@/db';
import { chatSessions } from '@/db/schema';
import { processIntelligence } from '@/lib/intelligenceEngine';
import { normalizeMessage } from '@/lib/normalizeMessage';
import {
  buildSystemPrompt,
  createBlankState,
  detectIntentFromText,
  detectSectorFromText,
  updateStateFromExtraction,
  type DealIntent,
  type RouterState
} from '@/lib/promptRouter';
import { buildFinalMessage } from '@/lib/responseBuilder';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';


/**
 * 🎯 HARDENED PRODUCTION CHAT SYSTEM (v4.0)
 * Resolves: Model decommissioning, Vercel build conflicts, silent failures.
 */

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

// getSystemPrompt removed in favor of modular promptRouter.ts



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
  // 1. HARD ENVIRONMENT VALIDATION
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

    // 🔥 Pre-processing layer (BEFORE LLM)
    const normalizedMessage = normalizeMessage(rawMessage);
    // const detectedConditions = extractSpecialConditions(rawMessage); // Removed as it's now handled inside promptRouter.ts

    // 🔥 NEW: Normalize message (fix typos, expand shorthands, translate Hinglish)
    const message = normalizedMessage;

    let documentText = body.document || body.documentText || "";
    const documentUrl = body.documentUrl || "";
    const documentId = body.documentId;
    let activeChatId = body.chatId;

    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    // 2. SESSION & MESSAGE PERSISTENCE
    const { data: { user: sbUser } } = await supabase.auth.getUser();
    let userId = sbUser?.id || session.user.id;

    // Critical: Ensure the user exists in the public.users table to satisfy FK constraints
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
        // Create user if absolutely missing
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

    // 2. SESSION & STATE LOADING
    let storedState: RouterState = createBlankState();

    // Consistency Guard: If chatId is missing but documentId is present, try to find the seeded session
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

    // Standard session loading if chatId exists
    if (activeChatId) {
      console.log(`[STATE] Loading existing session: ${activeChatId}`);
      const { data: existingSession } = await supabase
        .from("chat_sessions")
        .select("id, document_id, state")
        .eq("id", activeChatId)
        .single();

      if (!existingSession) {
        console.log("[STATE] Provided chatId not found, checking for last active session...");
        activeChatId = null;
      } else {
        storedState = {
          ...createBlankState(),
          ...(existingSession.state as unknown as Partial<RouterState> || {})
        };
        console.log(`[STATE] Loaded state for phase: ${storedState.phase} | turn: ${storedState.turn_count}`);
      }
    }



    // If still no active session, create one
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

    // 🔥 PERSISTENT CONTEXT RESTORATION (Moved after session recovery)
    // If no document text but activeChatId is now present, fetch the linked document
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

    // 3. PERSIST USER MESSAGE
    await supabase.from("chat_messages").insert([{
      chat_id: activeChatId,
      role: 'user',
      content: message,
    }]);

    // 4. FETCH HISTORY
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
      return {
        role: h.role as "user" | "assistant" | "system",
        content: content
      };
    });

    // 🔥 5. MATCHMAKING ENGINE (Isolate DB failures from AI flow)
    const { mandates } = await import('@/db/schema');
    const { and, eq, not, arrayOverlaps } = await import('drizzle-orm');

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
        // We continue with matchedMandatesStr as default to avoid 500
      }
    }

    // 5. AI PROCESSING & INTELLIGENCE
    // PRE-DETECTION: Detect intent and sector from current message before building prompt.
    // This ensures M3 and M4 load on turn 1 even though storedState is still blank.
    // storedState itself is NOT modified here — only candidateState is used for prompt building.
    const candidateState: RouterState = { ...storedState };

    if (!candidateState.intent) {
      const detectedIntent = detectIntentFromText(message);
      if (detectedIntent) {
        candidateState.intent = detectedIntent;
        console.log(`[PRE-DETECT] Intent detected from message: ${detectedIntent}`);
      }
    }

    if (!candidateState.sector) {
      const detectedSector = detectSectorFromText(message);
      if (detectedSector) {
        candidateState.sector = detectedSector;
        console.log(`[PRE-DETECT] Sector detected from message: ${detectedSector}`);
      }
    }

    // Use candidateState for prompt building — not storedState
    const { systemPrompt, modulesLoaded, tokenEstimate } = buildSystemPrompt(
      candidateState,
      matchedMandatesStr
    );
    console.log(`[ROUTER] Modules: ${modulesLoaded.join(', ')} | ~${tokenEstimate} tokens`);

    const extraction = await processIntelligence(
      message,
      formattedHistory,
      documentText,
      systemPrompt
    );

    const aiContent = JSON.stringify(extraction);
    console.log("🧠 FINAL DATA:", aiContent);

    // 6. UPDATE STATE & PERSIST ASSISTANT RESPONSE
    // 🛡️ STATE HYDRATION GUARD: Ensure we don't lose previously extracted data
    const updatedState = updateStateFromExtraction(
      storedState,
      extraction as unknown as { intent: DealIntent; state: Partial<RouterState>; is_complete: boolean },
      message,
      modulesLoaded
    );

    // 🛡️ PHASE LOCK: If we were in MOMENTUM, stay in MOMENTUM (unless complete)
    if (storedState.phase === 'MOMENTUM' && updatedState.phase !== 'CLOSURE' && !updatedState.is_complete) {
      updatedState.phase = 'MOMENTUM';
      updatedState.is_sufficient = true; // Maintain sufficiency
    }

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

    // Persist updated state to session
    await supabase
      .from('chat_sessions')
      .update({ state: updatedState })
      .eq('id', activeChatId);

    // 7. DEAL EXTRACTION LOGIC & PERSISTENCE
    const s = extraction.state;
    const isComplete = extraction.is_complete;

    console.log("🧠 FINAL DATA:", JSON.stringify(extraction));

    // Resolve deal_size from multiple possible sources
    const resolvedDealSize =
      s.deal_size ||
      s.revenue ||
      (s.industry_data?.capacity as string) ||
      (s.industry_data?.installed_capacity as string) ||
      null;

    if (isComplete) {
      console.log("✅ DATA COMPLETE - INSERTING INTO DB");
      try {
        // Parse deal size and revenue if they are strings like "10-50 Cr"
        const parseRange = (val: string | null) => {
          if (!val) return { min: null, max: null };
          // Handle ranges like "10-50 Cr", "20-30 MW", "15 to 20 Cr"
          const rangeMatch = val.match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/i);
          if (rangeMatch) return { min: rangeMatch[1], max: rangeMatch[2] };
          // Handle single values like "20 MW", "15Cr", "~90 acres"
          const singleMatch = val.match(/~?(\d+(?:\.\d+)?)/);
          if (singleMatch) return { min: singleMatch[1], max: singleMatch[1] };
          return { min: null, max: null };
        };

        const size = parseRange(resolvedDealSize);
        const revenue = parseRange(s.revenue || s.deal_size);

        // Step 3: Insert into Mandates
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
            // For non-Cr deals (MW, acres etc.) store raw string in special_conditions
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

        // Step 4: Insert into Deals
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

    // 🔬 DEBUG STRATEGY: Log critical pipeline steps
    console.log(`[DEBUG] RouterState Phase: ${storedState.phase} | is_sufficient: ${storedState.is_sufficient}`);
    console.log(`[DEBUG] System Prompt Length: ${systemPrompt.length} chars`);
    console.log(`[DEBUG] AI Output Valid JSON: ${!!extraction}`);
    console.log(`[DEBUG] Final Message: ${finalMessage.slice(0, 50)}...`);

    return Response.json({
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

    return Response.json({
      success: false,
      error: errorMessage,
      stack: errorStack
    }, { status: 500 });
  }
}