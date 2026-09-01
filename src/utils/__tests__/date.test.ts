import { describe, it, expect } from 'vitest';
import { formatExactDateTime, formatRelativeTime, formatDealTimestamp } from '../date';

describe('Canonical Date and Time Utilities', () => {
  const fixedNow = new Date('2026-08-31T14:30:00.000Z');

  describe('formatExactDateTime', () => {
    it('formats exact date and time in readable format', () => {
      const d = new Date('2026-08-31T14:30:00.000Z');
      const res = formatExactDateTime(d);
      expect(res).toContain('2026');
      expect(res).toContain('Aug');
      expect(res).toMatch(/\d{1,2}:\d{2}\s+(AM|PM)/);
    });

    it('handles null, undefined and invalid dates gracefully', () => {
      expect(formatExactDateTime(null)).toBe('Date unavailable');
      expect(formatExactDateTime(undefined)).toBe('Date unavailable');
      expect(formatExactDateTime('invalid')).toBe('Invalid date');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "Just now" for times under 45 seconds', () => {
      const recent = new Date(fixedNow.getTime() - 20 * 1000);
      expect(formatRelativeTime(recent, fixedNow)).toBe('Just now');
    });

    it('returns minutes ago', () => {
      const tenMinsAgo = new Date(fixedNow.getTime() - 10 * 60 * 1000);
      expect(formatRelativeTime(tenMinsAgo, fixedNow)).toBe('10 minutes ago');
    });

    it('returns 1 hour ago', () => {
      const oneHourAgo = new Date(fixedNow.getTime() - 65 * 60 * 1000);
      expect(formatRelativeTime(oneHourAgo, fixedNow)).toBe('1 hour ago');
    });

    it('returns hours ago', () => {
      const fiveHoursAgo = new Date(fixedNow.getTime() - 5 * 3600 * 1000);
      expect(formatRelativeTime(fiveHoursAgo, fixedNow)).toBe('5 hours ago');
    });

    it('returns 1 day ago', () => {
      const oneDayAgo = new Date(fixedNow.getTime() - 25 * 3600 * 1000);
      expect(formatRelativeTime(oneDayAgo, fixedNow)).toBe('1 day ago');
    });

    it('returns 2 days ago', () => {
      const twoDaysAgo = new Date(fixedNow.getTime() - 49 * 3600 * 1000);
      expect(formatRelativeTime(twoDaysAgo, fixedNow)).toBe('2 days ago');
    });

    it('returns 3 days ago', () => {
      const threeDaysAgo = new Date(fixedNow.getTime() - 73 * 3600 * 1000);
      expect(formatRelativeTime(threeDaysAgo, fixedNow)).toBe('3 days ago');
    });
  });

  describe('formatDealTimestamp (with 3-day approval window)', () => {
    it('calculates remaining window and deadline proximity', () => {
      // 2 days ago = 48h elapsed -> 24h remaining in 72h window
      const twoDaysAgo = new Date(fixedNow.getTime() - 48 * 3600 * 1000);
      const res = formatDealTimestamp(twoDaysAgo, fixedNow);
      expect(res.relative).toBe('2 days ago');
      expect(res.hoursRemaining).toBe(24);
      expect(res.isNearDeadline).toBe(true);
      expect(res.isExpired).toBe(false);
    });

    it('identifies expired 3-day window', () => {
      // 4 days ago = 96h elapsed -> expired
      const fourDaysAgo = new Date(fixedNow.getTime() - 96 * 3600 * 1000);
      const res = formatDealTimestamp(fourDaysAgo, fixedNow);
      expect(res.isExpired).toBe(true);
      expect(res.hoursRemaining).toBe(0);
    });
  });
});
