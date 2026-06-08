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
  detectShellQuery,
  detectGatewaySector,
  updateStateFromExtraction,
  computeQualityGate,
  type QualityGateResult,
  type DealIntent,
  type RouterState
} from '@/lib/promptRouter';
import { buildFinalMessage } from '@/lib/responseBuilder';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse, after } from 'next/server';
import { executeMatchmaking, type ProposalInput, type MatchCard, type MatchmakingResult } from '@/lib/matchmakingEngine';
import crypto from 'crypto';

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

  // Declared outside try so it's accessible in the catch block
  let updatedState: RouterState = createBlankState();

  try {
    const proposalId = crypto.randomUUID();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const rawMessage = body.message || "";
    const message = normalizeMessage(rawMessage);

    let documentText = body.document || body.documentText || "";
    let documentUrl = body.documentUrl || "";
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
    // Runs when: (a) no document text yet, OR (b) documentId is present and body text looks
    // truncated (frontend caps at 3000 chars — we need the full extracted_text for proposal persistence).
    // Also loads documentUrl when not provided in the body (subsequent turns have no file attachment).
    const needsDocLoad = !documentText || (!!documentId && documentText.length < 10_000);
    if (needsDocLoad && activeChatId) {
      console.log(`[PERSISTENCE] Loading document context for chat: ${activeChatId} | have ${documentText.length} chars`);
      const { data: sessionDoc } = await supabase
        .from('chat_sessions')
        .select('document_id')
        .eq('id', activeChatId)
        .maybeSingle();

      const docId = documentId || sessionDoc?.document_id;
      if (docId) {
        const { data: doc } = await supabase
          .from('documents')
          .select('extracted_text, url')
          .eq('id', docId)
          .maybeSingle();
        if (doc?.extracted_text && doc.extracted_text.length > documentText.length) {
          documentText = doc.extracted_text;
          console.log(`[PERSISTENCE] Full document text loaded: ${documentText.length} chars`);
        }
        if (!documentUrl && doc?.url) {
          documentUrl = doc.url;
          console.log(`[PERSISTENCE] Document URL loaded: ${documentUrl}`);
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
    // Pass null when no context found so LLM gets the neutral "matching is running" message
    // instead of generating contradictory "no matches found" text (BUG #3 fix).
    let matchedMandatesStr: string | null = null;

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
          matchedMandatesStr = results.map(r => {
            const size = (r.deal_size_min_cr || r.deal_size_max_cr)
              ? `${r.deal_size_min_cr || '?'}-${r.deal_size_max_cr || '?'} Cr`
              : 'Undisclosed';
            const geo = r.geographies?.length ? r.geographies.join(", ") : 'Global/Flexible';
            return `- [${r.intent}] ${r.sectors?.join(", ") || 'General'} | Size: ${size} | Geography: ${geo}`;
          }).join("\n");
          console.log(`[MATCHMAKING] Found ${results.length} context matches.`);
        } else {
          console.log('[MATCHMAKING] No context mandates found — LLM will use neutral matching message.');
        }
      } catch (matchErr) {
        console.error("❌ MATCHMAKING CONTEXT FAILED (isolated):", matchErr);
      }
    }

    // ─── PRE-DETECTION ────────────────────────────────────────
    const candidateState: RouterState = { ...storedState };
    const fullTextForDetection = documentText ? `${message}\n\n${documentText}` : message;

    if (!candidateState.intent) {
      const detectedIntent = detectIntentFromText(fullTextForDetection);
      if (detectedIntent) {
        candidateState.intent = detectedIntent;
        console.log(`[PRE-DETECT] Intent: ${detectedIntent}`);
      }
    }

    if (!candidateState.sector) {
      const detectedSector = detectSectorFromText(fullTextForDetection);
      if (detectedSector) {
        candidateState.sector = detectedSector;
        console.log(`[PRE-DETECT] Sector: ${detectedSector}`);
      }
    }

    // RC1: Intermediary every turn
    if (candidateState.is_intermediary === null) {
      const detectedRole = detectIntermediaryFromText(fullTextForDetection);
      if (detectedRole) {
        candidateState.is_intermediary = detectedRole;
        console.log(`[PRE-DETECT] Intermediary: ${detectedRole}`);
      }
    }

    // RC9: Shell company
    if (candidateState.sub_sector === null && detectShellCompanyFromText(fullTextForDetection)) {
      candidateState.sub_sector = 'shell_company';
      console.log('[PRE-DETECT] Shell company — sub_sector=shell_company');
    }

    // RC2: Structure, size, revenue
    if (!candidateState.structure) {
      const s = detectStructureFromText(fullTextForDetection);
      if (s) { candidateState.structure = s; console.log(`[PRE-DETECT] Structure: ${s}`); }
    }
    if (!candidateState.deal_size) {
      const ds = detectDealSizeFromText(fullTextForDetection);
      if (ds) { candidateState.deal_size = ds; console.log(`[PRE-DETECT] Deal size: ${ds}`); }
    }
    if (!candidateState.revenue) {
      const rv = detectRevenueFromText(fullTextForDetection);
      if (rv) { candidateState.revenue = rv; console.log(`[PRE-DETECT] Revenue: ${rv}`); }
    }

    // ── NM5: Shell query detection ────────────────────────────
    if (!candidateState.is_shell_query) {
      const isShellQuery = detectShellQuery(message);
      if (isShellQuery) {
        candidateState.is_shell_query = true;
        console.log('[PRE-DETECT] Shell query detected');
      }
    }

    // ── NM3: Gateway sector clarifier ────────────────────────
    if (!candidateState.gateway_clarifier) {
      const gateway = detectGatewaySector(message, candidateState.sector);
      if (gateway) {
        candidateState.gateway_clarifier = gateway;
        console.log(`[PRE-DETECT] Gateway clarifier: ${gateway}`);
      }
    } else {
      // Was active last turn — user answered it — clear it
      candidateState.gateway_clarifier = null;
      console.log('[PRE-DETECT] Gateway clarifier cleared');
    }

    // ── NM6: Document intake mode detection ──────────────────
    if (!candidateState.is_document_intake) {
      const preDetectedCount = [
        candidateState.intent,
        candidateState.sector,
        candidateState.deal_size,
        candidateState.structure,
        candidateState.revenue,
        candidateState.geography,
      ].filter(Boolean).length;

      const hasStructuralSignals = (
        (message.includes('\n•') || message.includes('\n*') || message.includes('\n-')) ||
        (message.split(':').length > 4) ||
        (message.includes('₹') && message.includes('Cr') && message.includes('\n'))
      );

      const isDocumentIntake = message.length > 300 && (preDetectedCount >= 3 || hasStructuralSignals);

      if (isDocumentIntake) {
        candidateState.is_document_intake = true;
        console.log(`[PRE-DETECT] Document intake mode — length: ${message.length}, fields: ${preDetectedCount}`);
      }
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
    // Update the router state based on extraction results
    updatedState = updateStateFromExtraction(
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

    // Persist NM3/NM5/NM6 state
    if (candidateState.gateway_clarifier !== null && updatedState.gateway_clarifier === null) {
      updatedState.gateway_clarifier = candidateState.gateway_clarifier;
    }
    if (candidateState.is_document_intake && !updatedState.is_document_intake) {
      updatedState.is_document_intake = true;
    }
    if (candidateState.is_shell_query && !updatedState.is_shell_query) {
      updatedState.is_shell_query = true;
    }

    // NM7: Persist quality gate state if set externally
    if (candidateState.quality_gate_passed && !updatedState.quality_gate_passed) {
      updatedState.quality_gate_passed = true;
    }
    if (candidateState.quality_gate_attempted && !updatedState.quality_gate_attempted) {
      updatedState.quality_gate_attempted = true;
    }
    if (candidateState.intent_validated !== null && updatedState.intent_validated === null) {
      updatedState.intent_validated = candidateState.intent_validated;
    }

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

    // ── Document-intake auto-clear: if stuck in doc-intake mode for 3+ turns ──
    // without the user confirming, exit doc-intake so M4 can load normally.
    if (updatedState.is_document_intake && !updatedState.is_complete && updatedState.turn_count > 3) {
      updatedState.is_document_intake = false;
      console.log('[ROUTE] Document-intake: auto-cleared after 3 turns without confirmation');
    }

    // ── M4 Guard: prevent early completion before M4 questions are asked AND answered ──
    //
    // Two cases handled:
    //   A) m4_questions_asked=false: M4 was never asked. Block + patch message.
    //   B) m4JustAsked: M4 was asked THIS SAME TURN (first time). Block same-turn closure
    //      so user gets one turn to answer. Message is kept (LLM already asked questions).
    //
    // RC3 (friction) bypasses this guard — user explicitly asked to proceed.
    // quality_gate_passed bypasses this guard — user has confirmed mandate via intent validation.
    // Gives up at turn 9 to prevent infinite loops.

    // true when M4 questions were asked for the first time in THIS turn's LLM response
    const m4JustAsked = !storedState.m4_questions_asked && updatedState.m4_questions_asked;

    const m4GuardShouldFire =
      updatedState.is_complete &&
      !hasFriction &&
      !!updatedState.sector &&
      (!updatedState.m4_questions_asked || m4JustAsked) &&
      updatedState.turn_count <= 9 &&
      !updatedState.quality_gate_passed; // BUG #1 fix: don't block after quality gate validated

    console.log('[ROUTE] Current State:', JSON.stringify({
      phase: updatedState.phase,
      quality_gate_passed: updatedState.quality_gate_passed,
      intent_validated: updatedState.intent_validated,
      is_complete: updatedState.is_complete,
      m4_questions_asked: updatedState.m4_questions_asked,
    }));
    if (updatedState.intent_validated === true) {
      console.log('[ROUTE] Confirmation Detected: true — user validated mandate');
    }

    if (m4GuardShouldFire) {
      updatedState.is_complete = false;
      updatedState.phase = 'QUALIFICATION';

      // Clear document-intake so M4 loads normally on next turn
      if (updatedState.is_document_intake) {
        updatedState.is_document_intake = false;
        console.log('[ROUTE] M4 guard: document-intake cleared — M4 will load next turn');
      }

      // Bump round_count so the geo gate (round_count===0) doesn't block M4 next turn
      if (!updatedState.geography && updatedState.round_count === 0) {
        updatedState.round_count = 1;
        console.log('[ROUTE] M4 guard: round_count bumped to bypass geo gate next turn');
      }

      (extraction as Record<string, unknown>).is_complete = false;

      if (!updatedState.m4_questions_asked) {
        // Case A: M4 was never asked — LLM wrote a premature closure/summary message.
        // Replace with a natural bridge so the user isn't confused by a closure that reverts.
        const sectorLabel = (updatedState.sector || 'target').replace(/_/g, ' ');
        const bridgeMsg =
          `Before I finalise this mandate, I need a few sector-specific details ` +
          `about the ${sectorLabel} target to find the most aligned counterparties.`;
        (extraction as Record<string, unknown>).message = bridgeMsg;
        console.log(`[ROUTE] M4 guard (A): message patched — M4 not yet asked, sector=${updatedState.sector}`);
      } else {
        // Case B: m4JustAsked — LLM correctly asked M4 questions this turn.
        // Don't touch the message (it already has M4 questions). Just block same-turn closure.
        console.log(`[ROUTE] M4 guard (B): m4JustAsked — prevented same-turn completion, turn=${updatedState.turn_count}`);
      }
    }

    // STEP A: Server-side intent validation detection
    // Runs before everything — if user is responding to the intent validation question
    if (updatedState.quality_gate_passed && updatedState.intent_validated === null) {
      const lower = message.toLowerCase().trim();
      const yesSignals = ['yes', 'confirm', 'genuine', 'correct', 'proceed', 'real',
        'absolutely', 'yes it is', 'yes this is', 'register it',
        'go ahead', 'activate'];
      const noSignals = ['no', 'not yet', 'exploring', 'just looking', 'not genuine',
        'cancel', 'no not yet', 'not real', 'not ready'];

      if (yesSignals.some(p => lower.includes(p))) {
        updatedState.intent_validated = true;
        updatedState.is_complete = true;
        (extraction as Record<string, unknown>).is_complete = true;
        console.log('[NM7] Intent validated: YES — proceeding to DB insert');
      } else if (noSignals.some(p => lower.includes(p))) {
        updatedState.intent_validated = false;
        updatedState.is_complete = false;
        console.log('[NM7] Intent validated: NO — soft consequence, no DB insert');
      }
    }

    // STEP B: Quality gate evaluation
    // Fires when is_complete=true but quality gate not yet passed
    if (updatedState.is_complete && !updatedState.quality_gate_passed &&
      updatedState.intent_validated !== true) {

      const qualityResult: QualityGateResult = computeQualityGate(updatedState);
      console.log(`[NM7] Quality gate: score ${qualityResult.score}/10 | passed: ${qualityResult.passed}`);

      if (!qualityResult.passed) {
        console.log(`[NM7] Gate FAIL — missing: ${qualityResult.missing.join(', ')}`);

        if (updatedState.quality_gate_attempted) {
          // Second failure — hard close without DB insert
          // Bot will re-ask via M_quality_gate_fail, but we don't reset round_count again
          console.log('[NM7] Second gate failure — hard close, no extension');
          updatedState.is_complete = false;
          updatedState.quality_gate_passed = false;
        } else {
          // First failure — give user one extension
          updatedState.quality_gate_attempted = true;
          updatedState.quality_score = qualityResult.score;
          updatedState.is_complete = false;
          updatedState.quality_gate_passed = false;
          updatedState.round_count = 0; // Reset for extension turns
          console.log('[NM7] First gate failure — extending conversation (round_count reset)');
        }

      } else {
        // Gate passes — move to intent validation
        console.log('[NM7] Gate PASS — awaiting intent validation');
        updatedState.quality_gate_passed = true;
        updatedState.quality_score = qualityResult.score;
        updatedState.is_complete = false; // Not yet — need Yes/No
        updatedState.intent_validated = null;
        // Phase resolves to INTENT_VALIDATION in resolvePhase()
        updatedState.phase = 'INTENT_VALIDATION';
      }
    }

    // ─── ENRICHMENT COMPLETENESS DIAGNOSTIC ──────────────────
    // Logs extracted industry_data, missing M3 fields, and finalization reason.
    // This satisfies the debug requirement: extracted fields / missing fields /
    // completeness score / enrichment stage / why finalize triggered.
    {
      const capturedIndustryKeys = Object.keys(updatedState.industry_data || {}).filter(k => updatedState.industry_data[k]);
      const m3FieldsPresent = {
        intent: !!updatedState.intent,
        sector: !!updatedState.sector,
        geography: !!updatedState.geography,
        deal_size: !!updatedState.deal_size,
        revenue: !!updatedState.revenue,
        structure: !!updatedState.structure,
        intent_focus: !!updatedState.intent_focus,
      };
      const m3MissingFields = Object.entries(m3FieldsPresent)
        .filter(([, v]) => !v).map(([k]) => k);
      const m3Score = Object.values(m3FieldsPresent).filter(Boolean).length;
      const m4Score = capturedIndustryKeys.length;

      // m4GuardShouldFire sets is_complete=false, so check it first
      let finalizeReason = 'not finalized';
      if (m4GuardShouldFire) {
        finalizeReason = 'BLOCKED-by-m4-guard';
      } else if (updatedState.is_complete) {
        if (hasFriction) finalizeReason = 'friction signal';
        else if (updatedState.turn_count >= 4) finalizeReason = 'rc8-4turn-autoclose';
        else finalizeReason = 'llm-extraction';
      }

      console.log(
        `[ENRICH] M3: ${m3Score}/7 fields ` +
        `| missing: [${m3MissingFields.join(',')}] ` +
        `| M4 keys captured: [${capturedIndustryKeys.join(',') || 'none'}] (${m4Score}) ` +
        `| m4_asked: ${updatedState.m4_questions_asked} ` +
        `| is_complete: ${updatedState.is_complete} (${finalizeReason}) ` +
        `| phase: ${updatedState.phase} | turn: ${updatedState.turn_count}`
      );
    }

    // ─── FINAL RESPONSE MESSAGE ──────────────────────────────
    const finalMessage = buildFinalMessage(extraction);
    // Sync the LLM extraction message with the delivered finalMessage to prevent duplicates in history
    extraction.message = finalMessage;

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

    // ─── CLOSURE BRANCH: DB PERSISTENCE + MATCHMAKING ─────────
    // ─── DEAL PERSISTENCE + MATCHMAKING ──────────────────────
    const s = extraction.state;
    let matchCards: MatchCard[] = [];
    let matchSummary: string | null = null;
    let matchResult: MatchmakingResult | null = null;
    let resolvedProposalId: string | null = null;

    // STEP C: DB insert — runs when the mandate structuring is complete
    const shouldInsert = updatedState.is_complete;

    if (shouldInsert) {
      console.log("✅ REQUIREMENT COMPLETE — INSERTING INTO DB AND MATCHING");

      try {
        const parseRange = (val: string | null) => {
          if (!val) return { min: null, max: null };
          const rangeMatch = val.match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/i);
          if (rangeMatch) return { min: rangeMatch[1], max: rangeMatch[2] };
          const singleMatch = val.match(/~?(\d+(?:\.\d+)?)/);
          if (singleMatch) return { min: singleMatch[1], max: singleMatch[1] };
          return { min: null, max: null };
        };

        const resolvedDealSize =
          s.deal_size ||
          s.revenue ||
          (s.industry_data?.capacity as string) ||
          (s.industry_data?.installed_capacity as string) ||
          null;

        const size = parseRange(resolvedDealSize);
        const revenue = parseRange((s.revenue || s.deal_size) ?? null);

        // Mandate insert
        const { data: mandateData, error: mandateErr } = await supabase
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
            intent_validated: true,
            quality_score: updatedState.quality_score,
          }])
          .select('id')
          .single();

        if (mandateErr) {
          console.error("Mandate insert error:", mandateErr);
          throw new Error(mandateErr.message);
        }

        // Deal insert
        await supabase.from("deals").insert([{
          user_id: userId,
          title: `${extraction.intent}: ${s.sector} deal`,
          sector: s.sector,
          region: s.geography,
          size: s.deal_size || "Undisclosed",
          status: 'live',
        }]);

        console.log("✅ DB INSERT SUCCESSFUL — mandate_id:", mandateData?.id, "| intent_validated: true | intent:", extraction.intent, "| sector:", s.sector, "| geo:", s.geography);

        // Matchmaking (background task with 12s synchronous race)
        if (mandateData?.id && extraction.intent) {
          console.log("[M5] Triggering matchmaking pipeline...");
          const { executeMatchmaking } = await import('@/lib/matchmakingEngine');

          const matchPromise = executeMatchmaking({
            id: proposalId,
            mandateId: mandateData.id,
            userId,
            intent: extraction.intent,
            raw_text: message,
            sector: s.sector ?? null,
            sub_sector: s.sub_sector ?? null,
            geography: s.geography ?? null,
            deal_size: s.deal_size ?? null,
            revenue: s.revenue ?? null,
            structure: s.structure ?? null,
            intent_focus: s.intent_focus ?? null,
            industry_data: (s.industry_data as Record<string, unknown>) ?? {},
            special_conditions: s.industry_data ? [JSON.stringify(s.industry_data)] : [],
            deal_size_min: size.min,
            deal_size_max: size.max,
            revenue_min: revenue.min,
            revenue_max: revenue.max,
            is_shell_query: updatedState.is_shell_query ?? false,
          });

          const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 12000));
          matchResult = await Promise.race([matchPromise, timeoutPromise]);

          if (matchResult?.cards?.length) {
            matchCards = matchResult.cards;
            matchSummary = matchResult.summary;
            console.log('[ROUTE] Mandate Activated');
            console.log('[ROUTE] Matching Started');
            console.log(`[ROUTE] Matches Returned: ${matchResult.matchCount}`);
            console.log(`[M5] ${matchResult.matchCount} match cards. Top score: ${matchResult.topScore}`);
          } else {
            console.log('[ROUTE] Mandate Activated');
            console.log('[ROUTE] Matching Started (async — no immediate results within 12s)');
            console.log('[ROUTE] Matches Returned: 0 (will surface via /api/matches polling)');
            console.log("[M5] No immediate matches — will surface via /api/matches");
          }

          // Resolve proposalId for MatchPanel activation.
          // Primary: matchResult.proposalId (pipeline completed within 12s).
          // Fallback: DB lookup by mandate_id — Phase 4 of executeMatchmaking inserts
          // the proposal row before the slow pgvector search, so it exists on timeout too.
          resolvedProposalId = matchResult?.proposalId ?? null;
          if (!resolvedProposalId) {
            const { data: fallbackProp } = await supabase
              .from('proposals')
              .select('id')
              .eq('mandate_id', mandateData.id)
              .maybeSingle();
            if (fallbackProp?.id) {
              resolvedProposalId = fallbackProp.id;
              console.log('[M5] proposalId resolved via DB fallback:', resolvedProposalId);
            }
          }

          // Write the authoritative proposalId back into session state so
          // /api/chat/[id] can restore the MatchPanel after navigation/refresh.
          if (resolvedProposalId) {
            updatedState.proposal_id = resolvedProposalId;
            console.log(`[M5] session state.proposal_id set to: ${resolvedProposalId}`);
          }
        }

      } catch (dbErr) {
        console.error("❌ DB INSERT FAILED:", dbErr);
      }

    } else if (updatedState.quality_gate_passed && updatedState.intent_validated === false) {
      console.log("[NM7] No insert: user declined intent validation");
    } else if (updatedState.quality_gate_passed && updatedState.intent_validated === null) {
      console.log("[NM7] Quality passed — awaiting intent validation response");
    } else if (!updatedState.quality_gate_passed) {
      console.log(`[NM7] No insert: quality gate ${updatedState.quality_gate_attempted ? 'FAILED' : 'PENDING'}`);
    }

    // STEP D / OCC: Persist final state version check — prevents state regression
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

    return NextResponse.json({
      success: true,
      data: aiContent,
      message: finalMessage,
      is_complete: updatedState.is_complete,
      quality_gate_passed: updatedState.quality_gate_passed,
      intent_validated: updatedState.intent_validated,
      chatId: activeChatId,
      proposalId: resolvedProposalId,
      type: updatedState.is_complete ? 'complete' : 'conversation',
      matches: matchCards,
      matchSummary: matchSummary,
      is_document_intake: updatedState.is_document_intake,
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
      is_document_intake: updatedState.is_document_intake,
    }, { status: 500 });
  }
}