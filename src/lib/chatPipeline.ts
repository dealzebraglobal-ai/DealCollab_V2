/**
 * DealCollab — Channel-agnostic chat turn pipeline
 * =================================================
 * Extracts the channel-independent core of src/app/api/chat/route.ts's POST
 * handler (state load → pre-detection → prompt build → AI → resolveCompletion
 * → persistence → matchmaking) into a reusable function, so the WhatsApp
 * webhook can drive the SAME intake intelligence and matchmaking engine
 * without a second AI pipeline and without touching the working web chat
 * route (which stays session/OCC-coupled to the browser and is left as-is).
 *
 * Reuses, unmodified: intelligenceEngine.processIntelligence,
 * matchmakingEngine.executeMatchmaking, promptRouter (detectors +
 * buildSystemPrompt), resolveCompletion, dataQuality, responseBuilder.
 */

import { createServerSupabaseClient } from '@/utils/supabase/server';
import {
  normalizeIntent,
  normalizeSize,
} from '@/lib/dataQuality';
import { processIntelligence } from '@/lib/intelligenceEngine';
import { normalizeMessage } from '@/lib/normalizeMessage';
import {
  buildSystemPrompt,
  createBlankState,
  detectDealSizeFromText,
  detectFrictionSignal,
  detectGatewaySector,
  detectHelpQuery,
  detectIntermediaryFromText,
  detectRevenueFromText,
  detectSectorFromText,
  detectShellCompanyFromText,
  detectShellQuery,
  detectStructureFromText,
  type DealIntent,
  type RouterState,
} from '@/lib/promptRouter';
import { buildFinalMessage } from '@/lib/responseBuilder';
import { resolveCompletion, type Extraction } from '@/lib/resolveCompletion';
import { executeMatchmaking, type MatchCard, type MatchmakingResult } from '@/lib/matchmakingEngine';
import { notifyMatchViaWhatsApp } from '@/lib/whatsappNotify';

export type ChatChannel = 'WEB' | 'WHATSAPP';

export interface ChatTurnParams {
  userId: string;
  rawMessage: string;
  channel: ChatChannel;
  /** Existing chat_sessions.id to continue, if known. */
  chatId?: string | null;
  /** Required for channel='WHATSAPP' — persisted on chat_sessions for lookup on the next inbound message. */
  whatsappPhoneNumber?: string | null;
}

export interface ChatTurnResult {
  message: string;
  isComplete: boolean;
  chatId: string;
  proposalId: string | null;
  matchCards: MatchCard[];
  matchSummary: string | null;
  matchResult: MatchmakingResult | null;
}

/**
 * Finds the active WhatsApp chat session for a phone number, or creates one.
 * WhatsApp has no client-supplied chatId (unlike the browser, which tracks it
 * in component state) — continuity is keyed on whatsappPhoneNumber instead.
 */
async function resolveWhatsAppChatId(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  whatsappPhoneNumber: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('id, state')
    .eq('user_id', userId)
    .eq('whatsapp_phone_number', whatsappPhoneNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) return null;

  // A completed mandate closes the thread — the next inbound message starts a fresh one.
  const state = (existing.state as Partial<RouterState> | null) || null;
  if (state?.is_complete) return null;

  return existing.id;
}

export async function runChatTurn(params: ChatTurnParams): Promise<ChatTurnResult> {
  const { userId, channel } = params;
  const message = normalizeMessage(params.rawMessage || '');
  if (!message) throw new Error('Message is required');

  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error('Supabase client failed to initialize');

  let activeChatId = params.chatId ?? null;

  if (!activeChatId && channel === 'WHATSAPP' && params.whatsappPhoneNumber) {
    activeChatId = await resolveWhatsAppChatId(supabase, userId, params.whatsappPhoneNumber);
  }

  // ─── STATE LOADING ────────────────────────────────────────
  let storedState: RouterState = createBlankState();

  if (activeChatId) {
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('id, state')
      .eq('id', activeChatId)
      .single();

    if (!existingSession) {
      activeChatId = null;
    } else {
      storedState = { ...createBlankState(), ...((existingSession.state as Partial<RouterState>) || {}) };
    }
  }

  if (!activeChatId) {
    const { data: newSession, error: sessionErr } = await supabase
      .from('chat_sessions')
      .insert([{
        user_id: userId,
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        state: storedState,
        source: channel,
        whatsapp_phone_number: channel === 'WHATSAPP' ? params.whatsappPhoneNumber ?? null : null,
      }])
      .select()
      .single();
    if (sessionErr) throw new Error(sessionErr.message);
    activeChatId = newSession.id;
  }

  // ─── FRICTION HARD OVERRIDE (mirrors route.ts layer 2) ─────
  const hasFriction = detectFrictionSignal(message);
  if (hasFriction) {
    storedState = { ...storedState, is_complete: true, phase: 'CLOSURE' };
  }

  // ─── PERSIST USER MESSAGE ─────────────────────────────────
  await supabase.from('chat_messages').insert([{ chat_id: activeChatId, role: 'user', content: message }]);

  // ─── FETCH HISTORY ────────────────────────────────────────
  const { data: history } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', activeChatId)
    .order('created_at', { ascending: true });

  const formattedHistory = (history || []).map((h) => {
    let content = h.content;
    if (h.role === 'assistant') {
      try {
        const parsed = JSON.parse(h.content);
        content = parsed.message || h.content;
      } catch { /* keep raw content */ }
    }
    return { role: h.role as 'user' | 'assistant' | 'system', content };
  });

  // ─── MATCHMAKING CONTEXT (LLM prompt enrichment only) ─────
  let matchedMandatesStr = 'No active mandates found in database yet.';
  if (storedState.sector || storedState.intent) {
    try {
      const reverseIntentMap: Record<string, string> = {
        SELL_SIDE: 'BUY_SIDE',
        BUY_SIDE: 'SELL_SIDE',
        FUNDRAISING: 'BUY_SIDE',
        DEBT: 'DEBT',
        STRATEGIC_PARTNERSHIP: 'STRATEGIC_PARTNERSHIP',
      };
      const targetIntent = storedState.intent ? reverseIntentMap[storedState.intent] || null : null;

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
        matchedMandatesStr = results
          .map((r) => {
            const size = r.deal_size_min_cr || r.deal_size_max_cr ? `${r.deal_size_min_cr || '?'}-${r.deal_size_max_cr || '?'} Cr` : 'Undisclosed';
            const geo = r.geographies?.length ? r.geographies.join(', ') : 'Global/Flexible';
            return `- [${r.intent}] ${r.sectors?.join(', ') || 'General'} | Size: ${size} | Geography: ${geo}`;
          })
          .join('\n');
      }
    } catch (matchErr) {
      console.error('[chatPipeline] matchmaking context lookup failed (isolated):', matchErr);
    }
  }

  // ─── PRE-DETECTION (same detectors route.ts uses) ─────────
  const candidateState: RouterState = { ...storedState };
  const fullTextForDetection = message;

  if (!candidateState.sector) {
    const detectedSector = detectSectorFromText(fullTextForDetection);
    if (detectedSector) candidateState.sector = detectedSector;
  }
  if (candidateState.is_intermediary === null) {
    const detectedRole = detectIntermediaryFromText(fullTextForDetection);
    if (detectedRole) candidateState.is_intermediary = detectedRole;
  }
  if (candidateState.sub_sector === null && detectShellCompanyFromText(fullTextForDetection)) {
    candidateState.sub_sector = 'shell_company';
  }
  if (!candidateState.structure) {
    const s = detectStructureFromText(fullTextForDetection);
    if (s) candidateState.structure = s;
  }
  if (!candidateState.deal_size) {
    const ds = detectDealSizeFromText(fullTextForDetection);
    if (ds) candidateState.deal_size = ds;
  }
  if (!candidateState.revenue) {
    const rv = detectRevenueFromText(fullTextForDetection);
    if (rv) candidateState.revenue = rv;
  }
  if (!candidateState.is_shell_query) {
    if (detectShellQuery(message)) candidateState.is_shell_query = true;
  }
  if (!candidateState.gateway_clarifier) {
    const gateway = detectGatewaySector(message, candidateState.sector);
    if (gateway) candidateState.gateway_clarifier = gateway;
  } else {
    candidateState.gateway_clarifier = null;
  }

  // ─── BUILD SYSTEM PROMPT + AI CALL ─────────────────────────
  const helpQueryDetected = detectHelpQuery(message);
  const { systemPrompt } = buildSystemPrompt(candidateState, matchedMandatesStr, helpQueryDetected);

  let extraction: { intent: DealIntent; state: Partial<RouterState>; is_complete: boolean; message: string };
  const raw = await processIntelligence(message, formattedHistory, '', systemPrompt);
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

  // ─── COMPLETION RESOLUTION (shared pure function) ──────────
  const completion = resolveCompletion({
    storedState,
    extraction: extraction as Extraction,
    message,
    candidateState,
    modulesLoaded: [],
  });
  const updatedState = completion.state;
  extraction = completion.extraction as typeof extraction;

  // ─── FINAL MESSAGE ─────────────────────────────────────────
  const finalMessage = buildFinalMessage(extraction);
  extraction.message = finalMessage;

  await supabase.from('chat_messages').insert([{ chat_id: activeChatId, role: 'assistant', content: JSON.stringify(extraction) }]);

  // ─── CLOSURE: MANDATE/DEAL/PROPOSAL PERSISTENCE + MATCHMAKING ─
  const s = extraction.state;
  let matchCards: MatchCard[] = [];
  let matchSummary: string | null = null;
  let matchResult: MatchmakingResult | null = null;
  let resolvedProposalId: string | null = null;

  if (completion.shouldInsert) {
    try {
      const parseRange = (val: string | null) => {
        if (!val) return { min: null as string | null, max: null as string | null };
        const n = normalizeSize(val);
        if (!n || n.min_cr == null) return { min: null, max: null };
        return { min: String(n.min_cr), max: String(n.max_cr ?? n.min_cr) };
      };

      const normalizedIntentForSave = normalizeIntent(extraction.intent) ?? extraction.intent;
      const sameFinancialValue = !!s.deal_size && !!s.revenue && String(s.deal_size).trim().toLowerCase() === String(s.revenue).trim().toLowerCase();
      const dealSizeSource = normalizedIntentForSave === 'SELL_SIDE' && sameFinancialValue ? null : s.deal_size ?? null;
      const revenueSource = s.revenue ?? null;
      const size = parseRange(dealSizeSource);
      const revenue = parseRange(revenueSource);

      const { data: mandateData, error: mandateErr } = await supabase
        .from('mandates')
        .insert([{
          user_id: userId,
          raw_text: message,
          normalised_text: JSON.stringify(extraction),
          intent: normalizedIntentForSave,
          sectors: s.sector ? [s.sector] : [],
          geographies: s.geography ? [s.geography] : [],
          deal_size_min_cr: size.min,
          deal_size_max_cr: size.max,
          revenue_min_cr: revenue.min,
          revenue_max_cr: revenue.max,
          deal_structure: s.structure,
          special_conditions: s.industry_data ? [JSON.stringify(s.industry_data)] : [],
          urgency: 'Medium',
          buyer_type: s.intent_focus || 'Strategic',
          status: 'ACTIVE',
          source: channel,
          intent_validated: true,
          quality_score: updatedState.quality_score,
        }])
        .select('id')
        .single();

      if (mandateErr) throw new Error(mandateErr.message);

      await supabase.from('deals').insert([{
        user_id: userId,
        title: `${extraction.intent}: ${s.sector} deal`,
        sector: s.sector,
        region: s.geography,
        size: s.deal_size || 'Undisclosed',
        status: 'live',
      }]);

      if (mandateData?.id && extraction.intent) {
        matchResult = await executeMatchmaking({
          mandateId: mandateData.id,
          userId,
          intent: extraction.intent,
          raw_text: message,
          sector: s.sector ?? null,
          industry: updatedState.industry ?? s.industry ?? null,
          sub_sector: s.sub_sector ?? null,
          geography: s.geography ?? null,
          deal_size: s.deal_size ?? null,
          revenue: s.revenue ?? null,
          structure: s.structure ?? null,
          intent_focus: s.intent_focus ?? null,
          industry_data: { ...((s.industry_data as Record<string, unknown>) ?? {}), ...((updatedState.industry ?? s.industry) ? { industry: updatedState.industry ?? s.industry } : {}) },
          special_conditions: s.industry_data ? [JSON.stringify(s.industry_data)] : [],
          deal_size_min: size.min,
          deal_size_max: size.max,
          revenue_min: revenue.min,
          revenue_max: revenue.max,
          currency: updatedState.currency ?? s.currency ?? null,
          urgency: updatedState.urgency ?? s.urgency ?? null,
          inferred_urgency: updatedState.inferred_urgency ?? s.inferred_urgency ?? null,
          buyer_type: updatedState.buyer_type ?? s.buyer_type ?? null,
          inferred_buyer_type: updatedState.inferred_buyer_type ?? s.inferred_buyer_type ?? null,
          advisor_name: updatedState.advisor_name ?? s.advisor_name ?? null,
          contact_phone: updatedState.contact_phone ?? s.contact_phone ?? null,
          intent_validated: updatedState.intent_validated ?? s.intent_validated ?? false,
          is_shell_query: updatedState.is_shell_query ?? false,
          source: channel,
        });

        if (matchResult?.cards?.length) {
          matchCards = matchResult.cards;
          matchSummary = matchResult.summary;

          const topCard = matchResult.cards[0];
          void notifyMatchViaWhatsApp({
            userId,
            companySummary: `${topCard.sector || 'General'} • ${topCard.geography || 'Global'} • ${topCard.sizeRange || 'Undisclosed'}`,
            matchScorePercent: topCard.finalScore * 100,
          });
        }

        resolvedProposalId = matchResult?.proposalId ?? null;
        if (!resolvedProposalId) {
          const { data: fallbackProp } = await supabase
            .from('proposals')
            .select('id')
            .eq('mandate_id', mandateData.id)
            .maybeSingle();
          if (fallbackProp?.id) resolvedProposalId = fallbackProp.id;
        }
        if (resolvedProposalId) updatedState.proposal_id = resolvedProposalId;
      }
    } catch (dbErr) {
      console.error('[chatPipeline] mandate/matchmaking persistence failed:', dbErr);
    }
  }

  // ─── PERSIST FINAL STATE (OCC) ──────────────────────────────
  const { data: sessionRow } = await supabase.from('chat_sessions').select('state_version').eq('id', activeChatId).single();
  const currentVersion = ((sessionRow as { state_version?: number } | null)?.state_version) ?? 0;
  await supabase
    .from('chat_sessions')
    .update({ state: updatedState, state_version: currentVersion + 1 })
    .eq('id', activeChatId)
    .eq('state_version', currentVersion);

  return {
    message: finalMessage,
    isComplete: updatedState.is_complete,
    chatId: activeChatId as string,
    proposalId: resolvedProposalId,
    matchCards,
    matchSummary,
    matchResult,
  };
}
