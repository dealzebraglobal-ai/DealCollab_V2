# Patch 2 — promptRouter.ts

Three surgical changes. Line references match your current file.

## Change 1 — imports

In the detectors import block, add `detectHelpQuery`:

```ts
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
  detectHelpQuery,          // ← ADD
} from './detectors';
```

Below the M7 imports, add:

```ts
import { M8_HELP_CONTENT } from './M8_helpContent';
```

## Change 2 — re-exports

In the re-export block (the one route.ts consumes), add `detectHelpQuery`
alongside the other detectors:

```ts
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
  detectHelpQuery,          // ← ADD
  createBlankState,
  updateStateFromExtraction,
  initializeStateFromDocument,
  resolvePhase,
  computeQualityGate,
  M4_SHELL,
};
```

## Change 3 — buildSystemPrompt

**3a. Signature** — add an optional third parameter (backward compatible;
existing `buildSystemPrompt(state, matchedMandates)` calls keep working):

```ts
export function buildSystemPrompt(
  state:             RouterState,
  matchedMandates:   string | null,
  helpQueryDetected: boolean = false,     // ← ADD
): RouterOutput {
```

**3b. Module load** — find this exact location (the end of the special-modes
if/else chain, immediately BEFORE the phase-context section):

BEFORE:
```ts
    if (state.is_sufficient) {
      modules.push({ key: 'M5_matching', content: buildM5_Matching(matchedMandates) });
    }
  }

  // ── Phase context — injected before all modules ──────────
  const m4Loaded = modules.some(m => m.key.startsWith('M4_'));
```

AFTER:
```ts
    if (state.is_sufficient) {
      modules.push({ key: 'M5_matching', content: buildM5_Matching(matchedMandates) });
    }
  }

  // M8: contextual help — additive, loads alongside any mode,
  // never replaces the active flow
  if (helpQueryDetected) {
    modules.push({ key: 'M8_help_content', content: M8_HELP_CONTENT });
  }

  // ── Phase context — injected before all modules ──────────
  const m4Loaded = modules.some(m => m.key.startsWith('M4_'));
```

## Why this is safe

- `m4Loaded` checks `startsWith('M4_')` — the key `M8_help_content` cannot
  collide.
- Default `false` means every existing call site behaves identically until
  route.ts opts in (Patch 3).
- M8 loads in ALL modes including document intake and intent validation —
  intentional: a user can ask "do you charge?" at any phase, and M8 instructs
  the model to answer briefly and still produce the phase's required output.

## Verify

`# MODULES IN THIS PROMPT:` line in the generated prompt should include
`M8_help_content` only on turns where the user message contains a help signal.
