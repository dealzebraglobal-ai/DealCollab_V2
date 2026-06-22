/**
 * DealCollab — resolveCompletion()  [PHASE 1 — STEP 1: REPRODUCE]
 * ================================================================
 * PURPOSE
 *   Today, the decision "is this mandate done, and what happens next?" is made by
 *   ~6 mechanisms smeared across route.ts (the POST handler) and stateManager.ts,
 *   each able to flip is_complete on/off, running in a fixed order where later steps
 *   silently undo earlier ones. That logic lives inside a 950-line request handler
 *   that cannot be unit-tested without the full Next.js + Supabase + OpenAI stack.
 *
 *   This function lifts that ENTIRE pipeline into one pure function so it can be
 *   tested in isolation. It is a FAITHFUL REPRODUCTION — bugs included. We are NOT
 *   fixing anything here. Phases 2–5 change behavior; this step only makes the
 *   current behavior visible and lockable under test.
 *
 * MAPPING TO route.ts (src/app/api/chat/route.ts)
 *   - Friction layer 2 ............. L273–278  (patches storedState BEFORE extraction)
 *   - updateStateFromExtraction .... L496–501
 *   - Persist pre-detected values .. L504–512
 *   - Persist NM3/NM5/NM6 .......... L514–523
 *   - Persist quality/intent flags . L525–534
 *   - Friction layer 3 ............. L536–542
 *   - RC8 4-turn auto-close ........ L544–554
 *   - MOMENTUM phase lock .......... L556–560
 *   - Document-intake auto-clear ... L562–567
 *   - M4 guard ..................... L569–621
 *   - STEP A intent validation ..... L623–643
 *   - STEP B quality gate .......... L645–682
 *   - shouldInsert ................. L752  (updatedState.is_complete)
 *
 * WIRE-IN (later): route.ts's POST handler replaces L496–682 with a single call to
 * resolveCompletion(...) and reads the returned { state, extraction, shouldInsert,
 * messageOverride } instead of the in-line mutations.
 */

import { detectFrictionSignal, detectConfirmation } from './detectors';
import { computeQualityGate } from './qualityGate';
import { updateStateFromExtraction } from './stateManager';
import type { RouterState, DealIntent } from './types';

// LLM extraction shape, as route.ts treats it.
export interface Extraction {
  intent: DealIntent;
  state: Partial<RouterState>;
  is_complete: boolean;
  message: string;
  /** Phase 2.5: the AI's structured confirmation signal for the genuine-mandate question. */
  intent_validation?: 'yes' | 'no' | 'unclear' | string | null;
  /** Piece 1: 0–100 confidence in the inferred intent (drives the lock + the ask gate). */
  intent_confidence?: number | null;
  /** Piece 3: true ONLY when the user explicitly states a different goal — unlocks an intent change. */
  intent_changed?: boolean;
}

export interface ResolveCompletionInput {
  /** State loaded from chat_sessions.state BEFORE any friction patch (route's `storedState`). */
  storedState: RouterState;
  /** The LLM output object (route's `extraction`). Will be cloned, not mutated in place. */
  extraction: Extraction;
  /** The raw user message for this turn. */
  message: string;
  /** State after pre-detection (route's `candidateState`) — supplies values the LLM may not echo. */
  candidateState: RouterState;
  /** modulesLoaded from buildSystemPrompt — gates m4_questions_asked acceptance in stateManager. */
  modulesLoaded?: string[];
}

export interface ResolveCompletionResult {
  /** Final RouterState to persist (route's `updatedState`). */
  state: RouterState;
  /** Possibly-mutated extraction (is_complete / message may change). */
  extraction: Extraction;
  /** route's L752 `shouldInsert` — whether the mandate gets written + matched this turn. */
  shouldInsert: boolean;
  /** If set, route replaces the LLM message with this (the M4-guard "bridge" copy). */
  messageOverride: string | null;
  /** Diagnostics so tests/logs can assert WHY the turn resolved the way it did. */
  hasFriction: boolean;
  m4GuardFired: boolean;
  reason:
    | 'friction'
    | 'rc8-4turn-autoclose'
    | 'llm-extraction'
    | 'blocked-by-m4-guard'
    | 'quality-gate-extend'
    | 'quality-gate-hardclose'
    | 'quality-gate-pass-await-validation'
    | 'intent-validated-yes'
    | 'intent-validated-no'
    | 'already-captured'
    | 'not-finalized';
}

// Phase 3.2: confirmation logic moved to detectors.detectConfirmation (one shared,
// negation-aware detector used by both intent-validation and document synthesis).

// Step 1 + A1: the single fixed status line shown on EVERY turn after a deal is captured.
export const TERMINAL_STATUS_LINE =
  'Your mandate is active and secure with us. We are working continuously across the network ' +
  'to identify aligned counterparties — you can view current matches in your Deal Log, and we will ' +
  'be in touch via WhatsApp or email as new ones emerge. There is nothing further you need to do right now.';

// A1 — canonical stage copy. The engine (not the fallback writer) owns the message for every
// DECIDED stage, so the "structured successfully" line can never appear before genuine capture,
// the genuine-mandate question always shows at the right moment, and "ok / what next" can't loop.
// Question-asking stages keep the AI's message (it carries the actual questions).

export const GENUINE_MANDATE_QUESTION =
  'One confirmation before this goes live.\n\n' +
  'Is this a real, active mandate you are ready to act on? Only confirmed mandates enter the network — ' +
  'inaccurate or exploratory entries reduce your standing with counterparties.\n\n' +
  'Reply YES to activate matching now, or NO if you are still exploring.';

export const INTENT_DECLINED_MESSAGE =
  'Understood. Exploratory queries are welcome — this is how many deals begin.\n' +
  'Your session is saved. Return when you are ready to submit a confirmed mandate, and we will activate matching immediately.';

export const CAPTURE_CONFIRMATION =
  'Your mandate is active and secure with us. This is deal resolution, not deal distribution — we identify aligned ' +
  'counterparties, validate their intent, and surface only relevant opportunities for your approval. Aligned counterparties ' +
  'now appear in your Deal Log. We work continuously across the network and will notify you via WhatsApp or email as new matches emerge.';

export function resolveCompletion(input: ResolveCompletionInput): ResolveCompletionResult {
  const { message, candidateState, modulesLoaded = [] } = input;

  // Clone so callers can compare input vs output without aliasing surprises.
  const extraction: Extraction = JSON.parse(JSON.stringify(input.extraction));
  let storedState: RouterState = { ...input.storedState };

  let messageOverride: string | null = null;
  let m4GuardFired = false;

  // ── Terminal lock (Step 1) ─────────────────────────────────────────────────
  // The deal was already written + matched on an earlier turn. Do NOT re-run any
  // qualification, gate, or matching logic, and do NOT insert again. Every further
  // message ("ok", "thanks", "any update?") gets the SAME fixed status line.
  if (input.storedState.is_captured) {
    const terminal: RouterState = { ...input.storedState, is_complete: true, phase: 'CLOSURE' };
    extraction.is_complete = true;
    extraction.message = TERMINAL_STATUS_LINE;
    return {
      state: terminal,
      extraction,
      shouldInsert: false,
      messageOverride: TERMINAL_STATUS_LINE,
      hasFriction: false,
      m4GuardFired: false,
      reason: 'already-captured',
    };
  }

  // ── Friction layer 2 (route L273–278) ──────────────────────────────────────
  // Patches storedState BEFORE extraction. Also affects the MOMENTUM-lock check below,
  // which reads storedState.phase (route uses the patched value at L557).
  const hasFriction = detectFrictionSignal(message);
  if (hasFriction) {
    // Step 1: do NOT stamp phase='CLOSURE' here. Forcing the phase before the gates run
    // poisoned the regression guard so the genuine-mandate check (INTENT_VALIDATION) could
    // be skipped or get stuck at CLOSURE. Set the completion intent only; the gates below
    // (and resolvePhase) decide the real phase.
    storedState = { ...storedState, is_complete: true };
  }

  // ── updateStateFromExtraction (route L496–501) ─────────────────────────────
  const updatedState: RouterState = updateStateFromExtraction(
    storedState,
    extraction as unknown as { intent: DealIntent; state: Partial<RouterState>; is_complete: boolean; intent_confidence?: number | null; intent_changed?: boolean },
    message,
    modulesLoaded,
  );

  // ── Persist pre-detected values the LLM may not have re-extracted (L504–512) ─
  if (updatedState.is_intermediary === null && candidateState.is_intermediary !== null) {
    updatedState.is_intermediary = candidateState.is_intermediary;
  }
  if (!updatedState.sub_sector && candidateState.sub_sector) updatedState.sub_sector = candidateState.sub_sector;
  if (!updatedState.structure && candidateState.structure) updatedState.structure = candidateState.structure;
  if (!updatedState.deal_size && candidateState.deal_size) updatedState.deal_size = candidateState.deal_size;
  if (!updatedState.revenue && candidateState.revenue) updatedState.revenue = candidateState.revenue;

  // ── Persist NM3/NM5/NM6 (L514–523) ─────────────────────────────────────────
  if (candidateState.gateway_clarifier !== null && updatedState.gateway_clarifier === null) {
    updatedState.gateway_clarifier = candidateState.gateway_clarifier;
  }
  if (candidateState.is_document_intake && !updatedState.is_document_intake) {
    updatedState.is_document_intake = true;
  }
  if (candidateState.is_shell_query && !updatedState.is_shell_query) {
    updatedState.is_shell_query = true;
  }

  // ── Persist quality gate / intent_validated from candidate (L525–534) ──────
  if (candidateState.quality_gate_passed && !updatedState.quality_gate_passed) {
    updatedState.quality_gate_passed = true;
  }
  if (candidateState.quality_gate_attempted && !updatedState.quality_gate_attempted) {
    updatedState.quality_gate_attempted = true;
  }
  if (candidateState.intent_validated !== null && updatedState.intent_validated === null) {
    updatedState.intent_validated = candidateState.intent_validated;
  }

  // ── Friction layer 3 (L536–542) ────────────────────────────────────────────
  if (hasFriction) {
    updatedState.is_complete = true;
    // Part 2: do NOT stamp CLOSURE. Friction means "wrap up", not "skip the confirmation".
    // The gates below route a sufficient mandate to the single genuine-mandate confirmation
    // (or to a quality-gate extension if it is not yet sufficient).
    extraction.is_complete = true;
  }

  // ── RC8: 4-turn auto-close (L544–554) ──────────────────────────────────────
  if (
    updatedState.turn_count >= 4 &&
    (updatedState.intent || updatedState.sector) &&
    !updatedState.is_complete
  ) {
    updatedState.is_complete = true;
    // Part 2: do NOT stamp CLOSURE. Hitting the round limit must still go through the single
    // confirmation gate (or a quality-gate extension), never straight to a closure message.
    extraction.is_complete = true;
  }

  // ── MOMENTUM phase lock (L556–560) ─────────────────────────────────────────
  // Note: reads the (possibly friction-patched) storedState.phase, exactly as route does.
  if (storedState.phase === 'MOMENTUM' && updatedState.phase !== 'CLOSURE' && !updatedState.is_complete) {
    updatedState.phase = 'MOMENTUM';
    updatedState.is_sufficient = true;
  }

  // ── Document-intake auto-clear after 3 turns unconfirmed (L562–567) ────────
  if (updatedState.is_document_intake && !updatedState.is_complete && updatedState.turn_count > 3) {
    updatedState.is_document_intake = false;
  }

  // ── M4 guard (L569–621) ────────────────────────────────────────────────────
  const m4JustAsked = !storedState.m4_questions_asked && updatedState.m4_questions_asked;
  const m4GuardShouldFire =
    updatedState.is_complete &&
    !hasFriction &&
    !updatedState.is_document_intake &&   // Phase 3.3: documents take the fast-lane — skip M4 enrichment
    !!updatedState.sector &&
    (!updatedState.m4_questions_asked || m4JustAsked) &&
    updatedState.turn_count <= 9;

  if (m4GuardShouldFire) {
    m4GuardFired = true;
    updatedState.is_complete = false;
    updatedState.phase = 'QUALIFICATION';

    if (updatedState.is_document_intake) {
      updatedState.is_document_intake = false;
    }
    if (!updatedState.geography && updatedState.round_count === 0) {
      updatedState.round_count = 1;
    }
    extraction.is_complete = false;

    if (!updatedState.m4_questions_asked) {
      // Case A — M4 never asked: replace the LLM's premature closure with a bridge.
      const sectorLabel = (updatedState.sector || 'target').replace(/_/g, ' ');
      messageOverride =
        `Before I finalise this mandate, I need a few sector-specific details ` +
        `about the ${sectorLabel} target to find the most aligned counterparties.`;
      extraction.message = messageOverride;
    }
    // Case B — m4JustAsked: keep the LLM message (it already contains M4 questions).
  }

  // ── STEP A: ONE confirmation check — AI field primary, negation-aware backstop ──
  if (updatedState.quality_gate_passed && updatedState.intent_validated === null) {
    const decision = detectConfirmation(message, extraction.intent_validation);
    if (decision === 'yes') {
      updatedState.intent_validated = true;
      updatedState.is_complete = true;
      updatedState.phase = 'CLOSURE';
      extraction.is_complete = true;
    } else if (decision === 'no') {
      updatedState.intent_validated = false;
      updatedState.is_complete = false;
    }
  }

  // Phase 2.5: once the quality gate is passed, the mandate can ONLY complete on an
  // explicit yes. The LLM cannot self-complete past this gate — closes the hole where
  // is_complete=true slipped through (e.g. an unrecognised "sure") with intent_validated
  // still null, and the insert hardcoded intent_validated:true.
  if (updatedState.quality_gate_passed && updatedState.intent_validated !== true) {
    updatedState.is_complete = false;
    extraction.is_complete = false;
    // Step 1: if we are still waiting for the genuine-mandate Yes/No, the phase MUST be
    // INTENT_VALIDATION. Without this it could remain stuck at CLOSURE (set by friction or a
    // prior turn), and the regression guard would then refuse to return to INTENT_VALIDATION.
    if (updatedState.intent_validated === null) {
      updatedState.phase = 'INTENT_VALIDATION';
    }
  }

  // ── STEP B: quality gate (L645–682) ────────────────────────────────────────
  if (updatedState.is_complete && !updatedState.quality_gate_passed && updatedState.intent_validated !== true) {
    const q = computeQualityGate(updatedState);
    if (!q.passed) {
      if (updatedState.quality_gate_attempted) {
        // Second failure — hard close, no DB insert.
        updatedState.is_complete = false;
        updatedState.quality_gate_passed = false;
      } else {
        // First failure — one extension.
        updatedState.quality_gate_attempted = true;
        updatedState.quality_score = q.score;
        updatedState.is_complete = false;
        updatedState.quality_gate_passed = false;
        updatedState.round_count = 0;
      }
    } else if (updatedState.is_document_intake) {
      // Phase 3.4: a confirmed document IS the genuine mandate — skip the separate
      // genuine-mandate Y/N and go straight to matching. The quality gate just above is
      // the safety floor. This restores the "confirm → matching" document flow that the
      // prompt modules (M0/M2/M7) already promise.
      updatedState.quality_gate_passed = true;
      updatedState.quality_score = q.score;
      updatedState.intent_validated = true;
      updatedState.is_complete = true;
    } else {
      // Pass — move to intent validation (the genuine-mandate Y/N) for typed mandates.
      updatedState.quality_gate_passed = true;
      updatedState.quality_score = q.score;
      updatedState.is_complete = false;
      updatedState.intent_validated = null;
      updatedState.phase = 'INTENT_VALIDATION';
    }
  }

  // ── Final outputs ───────────────────────────────────────────────────────────
  // Step 1: insert ONCE. shouldInsert is true only on the turn the deal first completes,
  // never again (the terminal short-circuit above handles every later turn). Stamp
  // is_captured so the next turn takes the terminal path.
  const shouldInsert = updatedState.is_complete && !input.storedState.is_captured;
  if (shouldInsert) {
    updatedState.is_captured = true;
  }

  // ── A1: engine owns the message for every DECIDED stage ─────────────────────
  // messageOverride may already be set by the M4 guard (Case A). Only fill it for the
  // remaining decided stages, and never for the question-asking stages (leave null so the
  // route uses the AI's message, which carries the real questions). Setting extraction.message
  // means the correct copy flows through even the existing buildFinalMessage path (which
  // trusts a real message before inventing a closure).
  if (messageOverride === null) {
    if (shouldInsert) {
      messageOverride = CAPTURE_CONFIRMATION;                 // deal completes THIS turn
    } else if (updatedState.intent_validated === false) {
      messageOverride = INTENT_DECLINED_MESSAGE;              // user declined the genuine-mandate check
    } else if (updatedState.quality_gate_passed && updatedState.intent_validated === null) {
      messageOverride = GENUINE_MANDATE_QUESTION;             // awaiting the genuine-mandate Yes/No
    } else if (updatedState.quality_gate_attempted && !updatedState.quality_gate_passed) {
      messageOverride = computeQualityGate(updatedState).message;  // "to register this mandate we need: X"
    }
    if (messageOverride) {
      extraction.message = messageOverride;
    }
  }

  // Derive a single human-readable reason (mirrors route's [ENRICH] finalizeReason logic, extended).
  let reason: ResolveCompletionResult['reason'];
  if (m4GuardFired) {
    reason = 'blocked-by-m4-guard';
  } else if (updatedState.intent_validated === true && shouldInsert) {
    reason = 'intent-validated-yes';
  } else if (updatedState.intent_validated === false) {
    reason = 'intent-validated-no';
  } else if (updatedState.phase === 'INTENT_VALIDATION' && updatedState.quality_gate_passed) {
    // NOTE: if shouldInsert is ALSO true here, that's the "sure" edge (scenario M) —
    // inserting while phase still reads INTENT_VALIDATION and intent_validated is null.
    reason = 'quality-gate-pass-await-validation';
  } else if (updatedState.quality_gate_attempted && !updatedState.quality_gate_passed && !shouldInsert) {
    reason = updatedState.round_count === 0 ? 'quality-gate-extend' : 'quality-gate-hardclose';
  } else if (shouldInsert && hasFriction) {
    reason = 'friction';
  } else if (shouldInsert && updatedState.turn_count >= 4) {
    reason = 'rc8-4turn-autoclose';
  } else if (shouldInsert) {
    reason = 'llm-extraction';
  } else {
    reason = 'not-finalized';
  }

  return { state: updatedState, extraction, shouldInsert, messageOverride, hasFriction, m4GuardFired, reason };
}
