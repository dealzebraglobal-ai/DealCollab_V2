/**
 * DealCollab — Prompt Router (Thin Orchestrator)
 * ================================================
 * This file is the public API consumed by route.ts.
 * All logic lives in sub-modules. This file only:
 *   1. Imports from sub-modules
 *   2. Builds the system prompt (module selection + phaseContext)
 *   3. Re-exports everything route.ts needs (backward compatibility)
 *
 * Sub-module map:
 *   types.ts              → DealIntent, SectorKey, ConversationPhase, RouterState, RouterOutput
 *   detectors.ts          → all detect*() functions, VALID_SECTOR_KEYS
 *   stateManager.ts       → createBlankState, updateStateFromExtraction, initializeStateFromDocument, resolvePhase
 *   qualityGate.ts        → computeQualityGate, QualityGateResult
 *   M0_outputSchema.ts    → M0_OUTPUT_SCHEMA, PRE_FLIGHT_EXTRACTION
 *   M1_coreIdentity.ts    → M1_CORE_IDENTITY
 *   M2_phaseRules.ts      → M2_PHASE_RULES
 *   M3_intentFrameworks.ts → M3_MODULES
 *   M4_sectorIntel.ts     → M4_MODULES, M4_SHELL
 *   M5_matchingLayer.ts   → buildM5_Matching
 *   M6_profileIntel.ts    → M6_PROFILE_INTELLIGENCE
 *   M7_specialModes.ts    → M_INTENT_VALIDATION, buildQualityGateFailModule, M_DOCUMENT_INTAKE
 */

// ─────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────

import type { RouterState, RouterOutput, DealIntent, SectorKey, ConversationPhase } from './types';
import { VALID_SECTOR_KEYS } from './detectors';
import {
  detectSectorFromText,
  detectIntentFromText,
  detectProfileIntentFromText,
  detectFrictionSignal,
  detectIntermediaryFromText,
  detectShellCompanyFromText,
  detectStructureFromText,
  detectDealSizeFromText,
  detectRevenueFromText,
  detectShellQuery,
  detectGatewaySector,
} from './detectors';
import {
  createBlankState,
  updateStateFromExtraction,
  initializeStateFromDocument,
  resolvePhase,
  computeMissingM3Fields,
  shouldAskGeographyFirst,
  shouldAskBusinessModelFirst,
} from './stateManager';
import { computeQualityGate } from './qualityGate';
import type { QualityGateResult } from './qualityGate';
import { M0_OUTPUT_SCHEMA, PRE_FLIGHT_EXTRACTION } from './M0_outputSchema';
import { M1_CORE_IDENTITY } from './M1_coreIdentity';
import { M_INTENT_REASONING } from './M_intentReasoning';
import { M2_PHASE_RULES } from './M2_phaseRules';
import { M3_MODULES } from './M3_intentFrameworks';
import { M4_MODULES, M4_SHELL } from './M4_sectorIntel';
import { buildM5_Matching } from './M5_matchingLayer';
import { M6_PROFILE_INTELLIGENCE } from './M6_profileIntel';
import {
  M_INTENT_VALIDATION,
  buildQualityGateFailModule,
  M_DOCUMENT_INTAKE,
} from './M7_specialModes';

// ─────────────────────────────────────────────────────────────
// RE-EXPORTS — route.ts imports from '@/lib/promptRouter'
// All of these must remain exported from this file.
// ─────────────────────────────────────────────────────────────

export type { DealIntent, SectorKey, ConversationPhase, RouterState, RouterOutput, QualityGateResult };
export {
  VALID_SECTOR_KEYS,
  detectSectorFromText,
  detectIntentFromText,
  detectProfileIntentFromText,
  detectFrictionSignal,
  detectIntermediaryFromText,
  detectShellCompanyFromText,
  detectStructureFromText,
  detectDealSizeFromText,
  detectRevenueFromText,
  detectShellQuery,
  detectGatewaySector,
  createBlankState,
  updateStateFromExtraction,
  initializeStateFromDocument,
  resolvePhase,
  computeQualityGate,
  M4_SHELL,
};

// ─────────────────────────────────────────────────────────────
// BUILD SYSTEM PROMPT — the only logic that lives here
// Selects and sequences modules based on current state.
// ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  state: RouterState,
  matchedMandates: string | null,
): RouterOutput {
  const modules: Array<{ key: string; content: string }> = [];

  // M0 + M1 + M2 load always
  modules.push({ key: 'M0_output_schema', content: M0_OUTPUT_SCHEMA });
  modules.push({ key: 'M1_core_identity', content: M1_CORE_IDENTITY });
  modules.push({ key: 'M_intent_reasoning', content: M_INTENT_REASONING });
  modules.push({ key: 'M2_phase_rules', content: M2_PHASE_RULES });

  // ── Special modes (mutually exclusive, highest priority) ───
  if (state.is_profile_search || state.phase === 'PROFILE_SEARCH') {
    modules.push({ key: 'M6_profile_intelligence', content: M6_PROFILE_INTELLIGENCE });

  } else if (state.phase === 'INTENT_VALIDATION') {
    // NM7: Awaiting intent confirmation
    modules.push({ key: 'M_intent_validation', content: M_INTENT_VALIDATION });

  } else if (state.quality_gate_attempted && !state.quality_gate_passed) {
    // NM7: Quality gate failed — ask only missing fields
    const qualityResult = computeQualityGate(state);
    modules.push({ key: 'M_quality_gate_fail', content: buildQualityGateFailModule(qualityResult.message) });
    if (state.intent && M3_MODULES[state.intent]) {
      modules.push({ key: `M3_${state.intent}`, content: M3_MODULES[state.intent] });
    }

  } else if (state.is_document_intake && !state.is_complete) {
    // NM6: Document intake mode — synthesis confirmation only
    modules.push({ key: 'M_document_intake', content: M_DOCUMENT_INTAKE });

  } else {
    // ── Standard qualification flow ──────────────────────────

    if (state.intent && M3_MODULES[state.intent]) {
      modules.push({ key: `M3_${state.intent}`, content: M3_MODULES[state.intent] });
    }

    // NM4: Geography gate — suspend M4 on first turn if no geography
    const geoGateActive = shouldAskGeographyFirst(state);
    // B2: Business-model gate — suspend M4 until we know what the business actually does
    const businessModelGateActive = shouldAskBusinessModelFirst(state);
    // NM3: Gateway clarifier active — suspend M4
    const gatewayActive = !!state.gateway_clarifier;

    // M4 loads ONCE per session (m4_questions_asked gate)
    if (!state.m4_questions_asked && !geoGateActive && !businessModelGateActive && !gatewayActive) {
      if (state.sub_sector === 'shell_company') {
        modules.push({ key: 'M4_shell', content: M4_SHELL });
      } else if (state.sector && M4_MODULES[state.sector]) {
        modules.push({ key: `M4_${state.sector}`, content: M4_MODULES[state.sector] });
      }
    }

    if (state.is_sufficient) {
      modules.push({ key: 'M5_matching', content: buildM5_Matching(matchedMandates) });
    }
  }

  // ── Phase context — injected before all modules ──────────
  const m4Loaded = modules.some(m => m.key.startsWith('M4_'));

  const intermediaryLine = state.is_intermediary
    ? `# INTERMEDIARY_ROLE: ${state.is_intermediary} — DO NOT ask again.`
    : `# INTERMEDIARY_ROLE: unknown — ask once as FIRST LINE if not in current message`;

  const roundLine = state.round_count >= 4
    ? `# QUALIFICATION_ROUNDS: ${state.round_count}/4 — LIMIT REACHED. Summarise and close.`
    : `# QUALIFICATION_ROUNDS: ${state.round_count}/4`;

  const missingCount = computeMissingM3Fields(state);
  const compactLine = (missingCount > 0 && missingCount < 3)
    ? `# M3_FORMAT: compact — ${missingCount} field(s) missing. ONE natural sentence, NOT bullets.`
    : `# M3_FORMAT: standard`;

  const revenueLine = (state.intent === 'SELL_SIDE' && !state.revenue)
    ? `# REVENUE_REQUIRED: true — ask revenue + EBITDA FIRST`
    : `# REVENUE_REQUIRED: false`;

  const shellLine = (state.sub_sector === 'shell_company')
    ? `# SHELL_COMPANY_DETECTED: true — ask ONLY Structure · Licence · Compliance · Shareholding`
    : `# SHELL_COMPANY_DETECTED: false`;

  const documentIntakeLine = state.is_document_intake
    ? `# DOCUMENT_INTAKE_MODE: active — synthesis confirmation ONLY.`
    : `# DOCUMENT_INTAKE_MODE: inactive`;

  const gatewayLine = state.gateway_clarifier
    ? `# GATEWAY_CLARIFIER: active (${state.gateway_clarifier}) — ONE clarifying question ONLY. M4 suspended.`
    : `# GATEWAY_CLARIFIER: inactive`;

  const geoGateLine = shouldAskGeographyFirst(state)
    ? `# GEOGRAPHY_GATE: active — geography is missing. This turn FIRST ask what the business does (products/services and business model), THEN ask which city, state, or region it is in (sell-side) / which geography is being targeted (buy-side). You may also ask the core financials (revenue/EBITDA or budget, and transaction type). Do NOT ask any sector-specific or capacity/plant questions yet. M4 suspended.`
    : `# GEOGRAPHY_GATE: clear`;

  // B2: business-model gate — geography may be known, but we still don't know what the business does.
  const businessModelGateLine = shouldAskBusinessModelFirst(state)
    ? `# BUSINESS_MODEL_GATE: active — the business model is still unclear (we do not yet know what the company actually does or how it earns money). This turn, ask plainly what the company does — its main products or services, who its customers are, and how it makes money. Do NOT ask sector-specific, capacity, or plant questions yet. M4 suspended.`
    : `# BUSINESS_MODEL_GATE: clear`;

  // B4: hard cap on questions per message — never dump a checklist.
  const questionLimitLine = `# QUESTION_LIMIT: Ask at most 2–3 questions in a single message, grouped into one natural paragraph. NEVER present a long list of questions or more than 3 at once. If more than 3 things are missing, ask the 2–3 most important now and the rest on the next turn.`;

  const shellQueryLine = state.is_shell_query
    ? `# SHELL_QUERY: true — include shell proposals in matches.`
    : `# SHELL_QUERY: false — exclude shell proposals from matches.`;

  const qualityGateLine = state.quality_gate_passed
    ? `# QUALITY_GATE: passed (score ${state.quality_score}/10) — do NOT re-evaluate quality`
    : state.quality_gate_attempted
      ? `# QUALITY_GATE: failed — user is providing missing information. Ask ONLY missing fields.`
      : `# QUALITY_GATE: pending — not yet evaluated`;

  const intentValidatedLine = state.intent_validated === true
    ? `# INTENT_VALIDATED: yes — mandate confirmed genuine`
    : state.intent_validated === false
      ? `# INTENT_VALIDATED: no — user declined, deliver soft consequence`
      : state.quality_gate_passed
        ? `# INTENT_VALIDATED: awaiting — ask confirmation question verbatim`
        : `# INTENT_VALIDATED: not yet reached`;

  // Known fields — prevents re-asking
  const knownFields: string[] = [];
  if (state.intent) knownFields.push(`intent:${state.intent}`);
  if (state.sector) knownFields.push(`sector:${state.sector}`);
  if (state.industry) knownFields.push(`industry:${state.industry}`);
  if (state.sub_sector) knownFields.push(`sub_sector:${state.sub_sector}`);
  if (state.geography) knownFields.push(`geography:${state.geography}`);
  if (state.deal_size) knownFields.push(`deal_size:${state.deal_size}`);
  if (state.revenue) knownFields.push(`revenue:${state.revenue}`);
  if (state.structure) knownFields.push(`structure:${state.structure}`);
  if (state.intent_focus) knownFields.push(`rationale:${state.intent_focus}`);
  if (state.is_intermediary) knownFields.push(`role:${state.is_intermediary}`);

  // RC15: industry_data keys prevent M4 re-asking
  if (state.industry_data && typeof state.industry_data === 'object') {
    Object.entries(state.industry_data).forEach(([k, v]) => {
      if (v) knownFields.push(`${k}:${v}`);
    });
  }

  const phaseContext = [
    `\n# CURRENT CONVERSATION PHASE: ${state.phase}`,
    !state.intent
      ? `# INTENT_STATUS: NOT YET DETERMINED — reason about it using the INTENT block. Do NOT use any intent-specific opening line (e.g. "To position this correctly for relevant buyers") while intent is unknown. If the mandate is clear, commit the intent this turn; only ask one short clarifying question if the direction is truly ambiguous.`
      : `# INTENT_STATUS: ${state.intent}${state.intent_flavor ? ` (${state.intent_flavor})` : ''} — ESTABLISHED. Keep it stable; change only on an explicit goal change by the user.`,
    `# TURN: ${state.turn_count + 1} | REFINEMENTS USED: ${state.refinement_count}/3`,
    `# M4 QUESTIONS ASKED THIS SESSION: ${state.m4_questions_asked}`,
    `# MODULES IN THIS PROMPT: ${modules.map(m => m.key).join(', ')}`,
    intermediaryLine,
    roundLine,
    compactLine,
    revenueLine,
    shellLine,
    documentIntakeLine,
    gatewayLine,
    geoGateLine,
    businessModelGateLine,
    questionLimitLine,
    shellQueryLine,
    qualityGateLine,
    intentValidatedLine,
    knownFields.length > 0
      ? `# ██ FIELDS ALREADY PROVIDED — DO NOT ASK AGAIN: ${knownFields.join(' | ')}`
      : `# NO FIELDS EXTRACTED YET`,
    m4Loaded
      ? [
        `# ██ M4 IS LOADED — ASK SECTOR QUESTIONS NOW. MANDATORY IN THIS RESPONSE.`,
        `# ██ Sub-type: infer from context (e.g. "digital marketing" → Digital Marketing/Performance Marketing Agency).`,
        `# ██ Ask 2 targeted open-ended questions for that sub-type. Include AFTER M3 fields in same message.`,
        `# ██ HONESTY RULE: Only set m4_questions_asked=true if M4 questions PHYSICALLY APPEAR in your "message".`,
        `# ██ COMPLETION GATE: Set is_complete=false THIS TURN. User must answer M4 questions before finalising.`,
        `# ██ Flow: M3 compact sentence → blank line → M4 intro → M4 bullet questions → JSON: m4_questions_asked=true, is_complete=false.`,
      ].join('\n')
      : state.m4_questions_asked
        ? `# M4 PREVIOUSLY ASKED (prior turn) — extract user's answers into industry_data. is_complete=true is now ALLOWED if all key info is gathered.`
        : `# M4 NOT LOADED THIS TURN. Do NOT set m4_questions_asked=true. Do NOT set is_complete=true — sector enrichment questions have not been asked yet.`,
  ].join('\n');

  const systemPrompt = [
    PRE_FLIGHT_EXTRACTION,
    phaseContext,
    ...modules.map(m => m.content),
  ].join('\n\n---\n\n');

  return {
    systemPrompt,
    phase: state.phase,
    modulesLoaded: modules.map(m => m.key),
    tokenEstimate: Math.round(systemPrompt.length / 4),
  };
}
