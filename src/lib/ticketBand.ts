import { detectDealSizeFromText } from './detectors';

/**
 * Formats a deal size / ticket band into a clean human-readable string.
 * Examples:
 * - min: 20, max: 50 -> "₹20–50 Cr"
 * - min: 50, max: 50 -> "₹50 Cr"
 * - min: 25, max: null -> "₹25+ Cr"
 * - min: null, max: 100 -> "Up to ₹100 Cr"
 * - min: null, max: null, with text "budget 40 cr" -> "₹40 Cr"
 * - min: null, max: null, no text -> "Flexible"
 */
export function formatTicketBand(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
  fallbackText?: string | null
): string {
  const minN = min != null && !isNaN(Number(min)) && Number(min) > 0 ? Number(min) : null;
  const maxN = max != null && !isNaN(Number(max)) && Number(max) > 0 ? Number(max) : null;

  if (minN != null && maxN != null) {
    return minN === maxN ? `₹${minN} Cr` : `₹${minN}–${maxN} Cr`;
  }
  if (minN != null && maxN == null) {
    return `₹${minN}+ Cr`;
  }
  if (minN == null && maxN != null) {
    return `Up to ₹${maxN} Cr`;
  }

  // Try extracting money/size cues from free-text bio or description
  if (fallbackText) {
    const detected = detectDealSizeFromText(fallbackText);
    if (detected) return detected;
  }

  return 'Flexible';
}

export interface ProposalDealSizeInput {
  deal_size_min_cr?: number | string | null;
  deal_size_max_cr?: number | string | null;
  status?: string | null;
}

/**
 * Derives aggregate ticket band, deal size min/max bounds, and count from a user's proposals list.
 */
export function deriveTicketBandFromProposals(
  proposals: ProposalDealSizeInput[] | null | undefined,
  fallbackText?: string | null
): {
  ticketBand: string;
  dealSizeMin: number | null;
  dealSizeMax: number | null;
  mandatesCount: number;
  closedCount: string;
} {
  const count = proposals?.length || 0;
  const closedCountStr = count > 0 ? `${count} ${count === 1 ? 'mandate' : 'mandates'}` : 'Active member';

  if (!proposals || proposals.length === 0) {
    const band = fallbackText ? detectDealSizeFromText(fallbackText) || 'Flexible' : 'Flexible';
    return {
      ticketBand: band,
      dealSizeMin: null,
      dealSizeMax: null,
      mandatesCount: 0,
      closedCount: closedCountStr,
    };
  }

  const mins: number[] = [];
  const maxs: number[] = [];

  for (const p of proposals) {
    const minVal = p.deal_size_min_cr != null && !isNaN(Number(p.deal_size_min_cr)) && Number(p.deal_size_min_cr) > 0
      ? Number(p.deal_size_min_cr)
      : null;
    const maxVal = p.deal_size_max_cr != null && !isNaN(Number(p.deal_size_max_cr)) && Number(p.deal_size_max_cr) > 0
      ? Number(p.deal_size_max_cr)
      : null;

    if (minVal != null) mins.push(minVal);
    if (maxVal != null) maxs.push(maxVal);
  }

  if (mins.length === 0 && maxs.length === 0) {
    const band = fallbackText ? detectDealSizeFromText(fallbackText) || 'Flexible' : 'Flexible';
    return {
      ticketBand: band,
      dealSizeMin: null,
      dealSizeMax: null,
      mandatesCount: count,
      closedCount: closedCountStr,
    };
  }

  const overallMin = mins.length > 0 ? Math.min(...mins) : (maxs.length > 0 ? Math.min(...maxs) : null);
  const overallMax = maxs.length > 0 ? Math.max(...maxs) : (mins.length > 0 ? Math.max(...mins) : null);

  const band = formatTicketBand(overallMin, overallMax, fallbackText);
  return {
    ticketBand: band,
    dealSizeMin: overallMin,
    dealSizeMax: overallMax,
    mandatesCount: count,
    closedCount: closedCountStr,
  };
}
