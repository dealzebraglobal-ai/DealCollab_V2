// src/app/api/chat/route.ts
import { auth } from '@/auth';
import {
  computeQualityScore,
  normalizeIntent,
  normalizeSize,
  qualityTierFromScore,
} from '@/lib/dataQuality';
import { processIntelligence } from '@/lib/intelligenceEngine';
import { normalizeMessage } from '@/lib/normalizeMessage';
import {
  buildSystemPrompt,
  createBlankState,
  detectDealSizeFromText,
  detectFrictionSignal,
  detectIntentFromText,
  detectIntermediaryFromText,
  detectRevenueFromText,
  detectSectorFromText,
  detectShellCompanyFromText,
  detectStructureFromText,
  updateStateFromExtraction,
  type DealIntent,
  type RouterState
} from '@/lib/promptRouter';
import { buildFinalMessage } from '@/lib/responseBuilder';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * DealCollab Chat Route
 * =====================
 * BASE: repo v4.0 structure preserved exactly
 *   - NextResponse.json (not Response.json)
 *   - try/catch around processIntelligence with 502 fallback
 *   - resolvedDealSize logic retained
 *
 * SESSION FIXES (preserved):
 *   RC1 — Intermediary pre-detected every turn (semantic patterns)
 *   RC2 — Structure/size/revenue pre-detected from rich messages
 *   RC3 — Friction hard override (3-layer guarantee)
 *   RC8 — 4-turn server-side auto-close
 *   RC9 — Shell company server-side detection → sub_sector='shell_company'
 *
 * DC-MATCH-001 v1.0 INTEGRATION (this version):
 *   - normalizeIntent() canonicalizes intent before persistence
 *   - normalizeSize() replaces ad-hoc parseRange (handles Cr / lakh / USD M / INR M)
 *   - computeQualityScore() + qualityTierFromScore() drives Tier 1–4 assignment
 *   - Proposals table is now canonical (matchmaking source of truth)
 *   - Mandates table preserved for legacy reads (parallel write during transition)
 *   - Matchmaking ONLY fires on is_complete=true && qTier < 4 (no intermediate waste)
 *   - OCC version on chat_sessions prevents state-regression race conditions
 */

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// GET — chat history list
// ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser, error: fetchErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.user.email)
      .single();

    if (fetchErr || !dbUser) {
      console.warn("User not found in DB for history fetch:", session.user.email);
      return NextResponse.json([]);
    }

    const { data: history } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', dbUser.id)
      .order('created_at', { ascending: false });

    return NextResponse.json(history || []);
  } catch (error: unknown) {
    const err = error as Error;
    console.error("🔥 HISTORY FETCH ERROR:", err);
    return NextResponse.json(
      { success: false, error: err.message, stack: err.stack },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST — main chat turn
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    console.error("❌ CRITICAL: Missing GROQ_API_KEY");
    throw new Error("GROQ_API_KEY not found in runtime");
  }
  const apiKey = process.env.GROQ_API_KEY;
  console.log("KEY EXISTS:", !!apiKey);

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const rawMessage = body.message || "";
    const message = normalizeMessage(rawMessage);

    let documentText = body.document || body.documentText || "";
    const documentUrl = body.documentUrl || "";
    const documentId = body.documentId;
    let activeChatId = body.chatId;

    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

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
          .upsert(
            {
              email: session.user.email,
              name: session.user.name || session.user.email?.split('@')[0],
            },
            { onConflict: 'email' },
          )
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
      console.log(`[STATE] No activeChatId, searching for seeded session: ${docIdToSearch}`);
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
          ...((seededSession.state as unknown as Partial<RouterState>) || {}),
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
          ...((existingSession.state as unknown as Partial<RouterState>) || {}),
        };
        console.log(
          `[STATE] Phase: ${storedState.phase} | turn: ${storedState.turn_count} | intermediary: ${storedState.is_intermediary} | sub_sector: ${storedState.sub_sector}`,
        );
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
          state: storedState,
        }])
        .select()
        .single();
      if (sessionErr) throw new Error(sessionErr.message);
      activeChatId = newSession.id;
    }

    // ─── DOCUMENT RESTORATION ─────────────────────────────────
    if (!documentText && activeChatId) {
      console.log(`[PERSISTENCE] Restoring document context for chat: ${activeChatId}`);
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
          console.log(`[PERSISTENCE] Restored ${documentText.length} chars`);
        }
      }
    }

    // ─── RC3: FRICTION HARD OVERRIDE (layer 2 — before prompt build) ───
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
        } catch { /* keep raw content */ }
      }
      return { role: h.role as "user" | "assistant" | "system", content };
    });

    // ─── MATCHMAKING CONTEXT (LLM prompt enrichment only) ─────
    // NOTE: This is for AI context — real matching runs in executeMatchmaking on closure.
    let matchedMandatesStr = "No active mandates found in database yet.";

    if (storedState.sector || storedState.intent) {
      try {
        const reverseIntentMap: Record<string, string> = {
          SELL_SIDE: 'BUY_SIDE',
          BUY_SIDE: 'SELL_SIDE',
          FUNDRAISING: 'BUY_SIDE',
          DEBT: 'DEBT',
          STRATEGIC_PARTNERSHIP: 'STRATEGIC_PARTNERSHIP',
        };
        const targetIntent = storedState.intent
          ? (reverseIntentMap[storedState.intent] || null)
          : null;

        console.log(
          `[MATCHMAKING] Querying context | Sector: ${storedState.sector} | Intent: ${storedState.intent} → ${targetIntent}`,
        );

        let query = supabase
          .from('proposals')
          .select('intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr')
          .eq('status', 'ACTIVE')
          .neq('user_id', userId)
          .limit(3);

        if (targetIntent) query = query.eq('intent', targetIntent);
        if (storedState.sector) query = query.contains('sectors', [storedState.sector]);

        const { data: results } = await query;

        if (results && results.length > 0) {
          matchedMandatesStr = results.map(r =>
            `- [${r.intent}] ${r.sectors?.join(", ")} | Size: ${r.deal_size_min_cr}-${r.deal_size_max_cr} Cr | Geography: ${r.geographies?.join(", ")}`,
          ).join("\n");
          console.log(`[MATCHMAKING] Found ${results.length} context matches.`);
        }
      } catch (matchErr) {
        console.error("❌ MATCHMAKING CONTEXT FAILED (isolated):", matchErr);
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

    // RC1: Intermediary every turn
    if (candidateState.is_intermediary === null) {
      const detectedRole = detectIntermediaryFromText(message);
      if (detectedRole) {
        candidateState.is_intermediary = detectedRole;
        console.log(`[PRE-DETECT] Intermediary: ${detectedRole}`);
      }
    }

    // RC9: Shell company
    if (candidateState.sub_sector === null && detectShellCompanyFromText(message)) {
      candidateState.sub_sector = 'shell_company';
      console.log('[PRE-DETECT] Shell company — sub_sector=shell_company');
    }

    // RC2: Structure, size, revenue
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
      matchedMandatesStr,
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
      modulesLoaded,
    );

    // Persist pre-detected values the LLM may not have re-extracted
    if (updatedState.is_intermediary === null && candidateState.is_intermediary !== null) {
      updatedState.is_intermediary = candidateState.is_intermediary;
    }
    if (!updatedState.sub_sector && candidateState.sub_sector) {
      updatedState.sub_sector = candidateState.sub_sector;
    }
    if (!updatedState.structure && candidateState.structure) updatedState.structure = candidateState.structure;
    if (!updatedState.deal_size && candidateState.deal_size) updatedState.deal_size = candidateState.deal_size;
    if (!updatedState.revenue && candidateState.revenue) updatedState.revenue = candidateState.revenue;

    // RC3: Friction hard override (layer 3)
    if (hasFriction) {
      updatedState.is_complete = true;
      updatedState.phase = 'CLOSURE';
      (extraction as Record<string, unknown>).is_complete = true;
      console.log('[ROUTE] Friction override applied: is_complete=true, phase=CLOSURE');
    }

    // RC8: 4-turn auto-close
    if (
      updatedState.turn_count >= 4 &&
      (updatedState.intent || updatedState.sector) &&
      !updatedState.is_complete
    ) {
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

    // ─── OCC VERSION CHECK — prevents state regression ───────
    const { data: sessionRow } = await supabase
      .from('chat_sessions')
      .select('state_version')
      .eq('id', activeChatId)
      .single();
    const currentVersion = ((sessionRow as { state_version?: number } | null)?.state_version) ?? 0;

    const { error: stateErr } = await supabase
      .from('chat_sessions')
      .update({ state: updatedState, state_version: currentVersion + 1 })
      .eq('id', activeChatId)
      .eq('state_version', currentVersion);

    if (stateErr) {
      console.warn('[STATE] OCC conflict on chat_sessions update:', stateErr.message);
    }

    // ─── CLOSURE BRANCH: DB PERSISTENCE + MATCHMAKING ─────────
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
        // ─ NORMALIZE INTENT to canonical (BUY_SIDE | SELL_SIDE | ...) ─
        const canonicalIntent = normalizeIntent(extraction.intent);

        // ─ PARSE SIZES via canonical normalizer (Cr / lakh / USD M / INR M) ─
        const sizeNorm = resolvedDealSize ? normalizeSize(resolvedDealSize) : null;
        const revRaw = s.revenue || s.deal_size || null;
        const revNorm = revRaw ? normalizeSize(revRaw) : null;

        const size = {
          min: sizeNorm?.min_cr != null ? String(sizeNorm.min_cr) : null,
          max: sizeNorm?.max_cr != null ? String(sizeNorm.max_cr) : null,
        };
        const revenue = {
          min: revNorm?.min_cr != null ? String(revNorm.min_cr) : null,
          max: revNorm?.max_cr != null ? String(revNorm.max_cr) : null,
        };

        // ─ COMPUTE QUALITY SCORE + TIER (DC-MATCH-001 §3.3) ─
        const qScore = computeQualityScore({
          rawText: JSON.stringify(extraction), // Use full extracted data for quality scoring
          intent: canonicalIntent,
          sector: s.sector ?? null,
          geography: s.geography ?? null,
          deal_size_min_cr: sizeNorm?.min_cr ?? null,
          revenue_min_cr: revNorm?.min_cr ?? null,
          structure: s.structure ?? null,
          industry_data: s.industry_data,
        });
        const qTier = qualityTierFromScore(qScore);

        console.log(`[QUALITY] score=${qScore} tier=${qTier} intent=${canonicalIntent}`);

        // ─ INSERT INTO PROPOSALS (CANONICAL — matching source of truth) ─
        const { data: proposalData, error: proposalErr } = await supabase
          .from("proposals")
          .insert([{
            user_id: userId,
            raw_text: message,
            normalised_text: message,
            intent: canonicalIntent || 'BUY_SIDE', // proposals.intent is NOT NULL; fallback only if normalizer failed
            sectors: s.sector ? [s.sector] : [],
            geographies: s.geography ? [s.geography] : [],
            deal_size_min_cr: size.min,
            deal_size_max_cr: size.max,
            revenue_min_cr: revenue.min,
            revenue_max_cr: revenue.max,
            deal_structure: s.structure,
            special_conditions: s.industry_data ? [JSON.stringify(s.industry_data)] : [],
            quality_score: qScore,
            quality_tier: qTier.toString(),
            status: qTier === 4 ? 'PENDING_ENRICHMENT' : 'ACTIVE',
            source: 'WEB',
            embedding_status: 'PENDING',
          }])
          .select('id')
          .single();

        if (proposalErr) {
          console.error("❌ Proposal insert failed:", proposalErr);
          throw new Error(proposalErr.message);
        }

        // ─ INSERT INTO MANDATES (LEGACY — preserved for backward compat) ─
        const { error: mandateErr } = await supabase
          .from("mandates")
          .insert([{
            user_id: userId,
            raw_text: message,
            normalised_text: JSON.stringify(extraction),
            intent: canonicalIntent,
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
        if (mandateErr) console.warn("⚠️ Legacy mandates insert warning:", mandateErr.message);

        // ─ INSERT INTO DEALS (dashboard surface) ─
        const { error: dealErr } = await supabase
          .from("deals")
          .insert([{
            user_id: userId,
            title: `${canonicalIntent || 'DEAL'}: ${s.sector || 'mixed'} deal`,
            sector: s.sector,
            region: s.geography,
            size: s.deal_size || "Undisclosed",
            status: 'live',
          }]);
        if (dealErr) console.warn("⚠️ Deals insert warning:", dealErr.message);

        console.log("✅ DB INSERTS COMPLETE (proposals + mandates + deals)");

        // ─ M5 MATCHMAKING — blocking, only on full closure with viable quality ─
        if (proposalData?.id && canonicalIntent && qTier < 4) {
          console.log(`[M5] Closure detected — awaiting matchmaking (qTier=${qTier})...`);
          const { executeMatchmaking } = await import('@/lib/matchmakingEngine');

          try {
            const result = await executeMatchmaking({
              mandateId: proposalData.id,    // canonical proposal id
              userId,
              intent: canonicalIntent,
              raw_text: message,
              sector: s.sector || null,
              sub_sector: s.sub_sector || null,
              geography: s.geography || null,
              deal_size: s.deal_size || null,
              revenue: s.revenue || null,
              structure: s.structure || null,
              intent_focus: s.intent_focus || null,
              industry_data: (s.industry_data as Record<string, unknown>) || {},
              special_conditions: s.industry_data ? [JSON.stringify(s.industry_data)] : [],
              deal_size_min: size.min,
              deal_size_max: size.max,
              revenue_min: revenue.min,
              revenue_max: revenue.max,
              strategic_intent: s.intent_focus || null,
            });

            if (result) {
              console.log(`[M5] ✅ Matchmaking complete: ${result.matchCount} matches | top: ${result.topScore.toFixed(2)}`);
            }
          } catch (m5Err) {
            console.error("[M5] ❌ Pipeline failure during closure:", m5Err);
          }
        } else if (qTier === 4) {
          console.log("[M5] Skipped — Tier 4 (stub) proposal; queued for enrichment");
        } else if (!canonicalIntent) {
          console.warn("[M5] Skipped — no canonical intent extracted");
        }
        // NOTE: Intermediate non-blocking matchmaking REMOVED.
        // The previous `else if` branch fired wasteful embeddings on every turn.
        // Matchmaking now runs ONLY on is_complete=true && qTier < 4.

      } catch (dbErr) {
        console.error("❌ DB INSERT/MATCHMAKING FAILED:", dbErr);
      }
    }

    // ─── FINAL RESPONSE ──────────────────────────────────────
    const finalMessage = buildFinalMessage(extraction);

    console.log(
      `[DEBUG] ${storedState.phase}→${updatedState.phase} | intermediary:${updatedState.is_intermediary} | sub_sector:${updatedState.sub_sector} | m4_asked:${updatedState.m4_questions_asked} | friction:${hasFriction}`,
    );
    console.log(`[DEBUG] System Prompt Length: ${systemPrompt.length} chars`);
    console.log(`[DEBUG] Final Message: ${finalMessage.slice(0, 50)}...`);

    // Capture the proposal ID for frontend to fetch matches
    let returnedProposalId: string | null = null;
    if (isComplete) {
      // proposalData was created in the closure block; surface its ID
      const { data: latestProposal } = await supabase
        .from('proposals')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      returnedProposalId = latestProposal?.id ?? null;
    }

    return NextResponse.json({
      success: true,
      data: aiContent,
      message: finalMessage,
      is_complete: isComplete,
      chatId: activeChatId,
      proposalId: returnedProposalId,   // ← new
      type: isComplete ? 'complete' : 'conversation',
    });

  } catch (error: unknown) {
    console.error("❌ CHAT ERROR:", error);

    let errorMessage = "An unknown error occurred";
    let errorStack: string | undefined = undefined;

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
      stack: errorStack,
    }, { status: 500 });
  }
}