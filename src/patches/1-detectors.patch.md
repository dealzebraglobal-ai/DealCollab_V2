# Patch 1 — detectors.ts

Append the block below to the end of `detectors.ts` (after `detectGatewaySector`).
No existing code changes.

```ts
// ─────────────────────────────────────────────────────────────
// M8: HELP QUERY DETECTION
// Fires when the user asks about platform mechanics, pricing, or
// privacy mid-chat. Phrase-based to limit false positives — note
// bare 'charge' is deliberately absent (it matches "EV charger",
// which is a renewable-sector keyword), and 'nda' is matched with
// a word boundary ("secondary" contains the substring 'nda').
// Tune this list from real support questions over time.
// ─────────────────────────────────────────────────────────────

const HELP_QUERY_SIGNALS = [
  // pricing
  'token', 'do you charge', 'how much do you charge', 'what do you charge',
  'what does it cost', 'what is the cost', 'what will it cost',
  'is it free', 'is this free', 'pricing', 'any fees', 'what are the fees',
  'subscription', 'success fee', 'refund', 'lock-in', 'lock in period',
  // privacy / confidentiality
  'who can see', 'who will see', 'will my identity', 'is my identity',
  'is my data', 'data secure', 'data safe', 'privacy policy',
  'confidentiality policy', 'is this confidential', 'stay anonymous',
  'anonymized', 'anonymised', 'delete my proposal', 'delete my mandate',
  'delete my data',
  // process
  'how does this work', 'how does the platform', 'how does dealcollab',
  'how do matches', 'how will i be notified', 'how do i get notified',
  'what happens after', 'what happens next', 'when will i get a match',
  'how long for a match', 'how long does matching', 'do you guarantee',
];

export function detectHelpQuery(text: string): boolean {
  const lower = text.toLowerCase();
  const hit =
    HELP_QUERY_SIGNALS.some(sig => lower.includes(sig)) ||
    /\bnda\b/.test(lower);
  if (hit) console.log('[DETECTOR] Help query detected');
  return hit;
}
```

## Verify

- `grep -c "detectHelpQuery" detectors.ts` → 1 (the export).
- Spot-check false positives: `detectHelpQuery("we manufacture DC fast chargers")`
  → must be `false`. `detectHelpQuery("open to a secondary sale")` → must be
  `false`. `detectHelpQuery("do you charge anything?")` → `true`.
