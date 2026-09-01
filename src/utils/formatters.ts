/**
 * DealCollab — Canonical Match Score Formatter
 * ============================================
 * Normalizes and formats match scores across all UI components, API responses,
 * and WhatsApp messages to guarantee consistent percentage presentation.
 *
 * Handles both representations safely:
 * - Fractional scores (0.0 to 1.0, e.g. 0.94 -> 94%)
 * - Integer/percentage scores (0 to 100, e.g. 94 -> 94%)
 * - Edge cases: 0 -> 0%, 1 -> 100%, 0.5 -> 50%, null/undefined -> '0%' (or custom fallback)
 *
 * NEVER produces double conversions like 9400%.
 */

export function formatMatchScore(
  score: number | string | null | undefined,
  options?: { fallback?: string; includeSymbol?: boolean }
): string {
  const includeSymbol = options?.includeSymbol ?? true;
  const fallback = options?.fallback ?? (includeSymbol ? '0%' : '0');

  if (score === null || score === undefined || score === '') {
    return fallback;
  }

  const num = typeof score === 'string' ? parseFloat(score.trim().replace(/%/g, '')) : score;

  if (isNaN(num) || !isFinite(num)) {
    return fallback;
  }

  // Value is in [0, 1] range: treat as ratio/fraction
  // Note: 0 is 0%, 1 is 100%, 0.94 is 94%
  let percentage: number;
  if (num >= 0 && num <= 1) {
    percentage = Math.round(num * 100);
  } else {
    // Value is already in percentage scale (e.g. 94 or 94.5)
    percentage = Math.max(0, Math.min(100, Math.round(num)));
  }

  return includeSymbol ? `${percentage}%` : `${percentage}`;
}

/**
 * Returns numeric percentage in 0..100 range.
 */
export function normalizeMatchScoreNum(score: number | string | null | undefined): number {
  if (score === null || score === undefined || score === '') return 0;
  const num = typeof score === 'string' ? parseFloat(score.trim().replace(/%/g, '')) : score;
  if (isNaN(num) || !isFinite(num)) return 0;
  if (num >= 0 && num <= 1) {
    return Math.round(num * 100);
  }
  return Math.max(0, Math.min(100, Math.round(num)));
}
