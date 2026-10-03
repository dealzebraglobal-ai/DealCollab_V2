import { describe, it, expect } from 'vitest';
import { formatTicketBand, deriveTicketBandFromProposals } from '../ticketBand';

describe('ticketBand utilities', () => {
  describe('formatTicketBand', () => {
    it('formats a min and max range correctly', () => {
      expect(formatTicketBand(20, 50)).toBe('₹20–50 Cr');
      expect(formatTicketBand('10', '100')).toBe('₹10–100 Cr');
    });

    it('formats equal min and max as a single value', () => {
      expect(formatTicketBand(50, 50)).toBe('₹50 Cr');
    });

    it('formats min only as "₹X+ Cr"', () => {
      expect(formatTicketBand(25, null)).toBe('₹25+ Cr');
      expect(formatTicketBand(25, 0)).toBe('₹25+ Cr');
    });

    it('formats max only as "Up to ₹Y Cr"', () => {
      expect(formatTicketBand(null, 150)).toBe('Up to ₹150 Cr');
      expect(formatTicketBand(0, 150)).toBe('Up to ₹150 Cr');
    });

    it('extracts deal size from fallback text if min and max are not provided', () => {
      expect(formatTicketBand(null, null, 'Looking for buyout deals with budget 40 cr')).toBe('₹40 Cr');
      expect(formatTicketBand(null, null, 'Targeting ticket size ₹25-50 cr in B2B SaaS')).toBe('₹25–50 Cr');
    });

    it('returns "Flexible" if no deal size is specified anywhere', () => {
      expect(formatTicketBand(null, null, null)).toBe('Flexible');
      expect(formatTicketBand(null, null, 'General advisory in healthcare')).toBe('Flexible');
    });
  });

  describe('deriveTicketBandFromProposals', () => {
    it('aggregates across multiple proposals', () => {
      const proposals = [
        { deal_size_min_cr: 15, deal_size_max_cr: 40 },
        { deal_size_min_cr: 30, deal_size_max_cr: 100 },
      ];
      const result = deriveTicketBandFromProposals(proposals);
      expect(result.ticketBand).toBe('₹15–100 Cr');
      expect(result.dealSizeMin).toBe(15);
      expect(result.dealSizeMax).toBe(100);
      expect(result.mandatesCount).toBe(2);
      expect(result.closedCount).toBe('2 mandates');
    });

    it('handles proposals with single proposal single range', () => {
      const proposals = [{ deal_size_min_cr: 50, deal_size_max_cr: 150 }];
      const result = deriveTicketBandFromProposals(proposals);
      expect(result.ticketBand).toBe('₹50–150 Cr');
      expect(result.closedCount).toBe('1 mandate');
    });

    it('falls back to text detector when proposals have no sizes', () => {
      const proposals = [{ deal_size_min_cr: null, deal_size_max_cr: null }];
      const result = deriveTicketBandFromProposals(proposals, 'Ticket size ₹75 cr');
      expect(result.ticketBand).toBe('₹75 Cr');
      expect(result.closedCount).toBe('1 mandate');
    });

    it('falls back to "Flexible" when no proposals and no text clues exist', () => {
      const result = deriveTicketBandFromProposals([], 'Random bio with no money');
      expect(result.ticketBand).toBe('Flexible');
      expect(result.closedCount).toBe('Active member');
    });
  });
});
