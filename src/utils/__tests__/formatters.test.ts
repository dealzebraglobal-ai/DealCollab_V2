import { describe, it, expect } from 'vitest';
import { formatMatchScore, normalizeMatchScoreNum } from '../formatters';

describe('formatMatchScore canonical formatter', () => {
  it('formats 0 properly', () => {
    expect(formatMatchScore(0)).toBe('0%');
    expect(formatMatchScore('0')).toBe('0%');
  });

  it('formats 0.5 properly as 50%', () => {
    expect(formatMatchScore(0.5)).toBe('50%');
    expect(formatMatchScore('0.5')).toBe('50%');
  });

  it('formats 0.94 properly as 94%', () => {
    expect(formatMatchScore(0.94)).toBe('94%');
    expect(formatMatchScore('0.94')).toBe('94%');
  });

  it('formats 1 properly as 100%', () => {
    expect(formatMatchScore(1)).toBe('100%');
    expect(formatMatchScore('1')).toBe('100%');
  });

  it('formats 50 properly as 50%', () => {
    expect(formatMatchScore(50)).toBe('50%');
    expect(formatMatchScore('50')).toBe('50%');
  });

  it('formats 94 properly as 94% — NEVER 9400%', () => {
    expect(formatMatchScore(94)).toBe('94%');
    expect(formatMatchScore('94')).toBe('94%');
    expect(formatMatchScore(94)).not.toBe('9400%');
    expect(formatMatchScore('94%')).toBe('94%');
  });

  it('formats 100 properly as 100%', () => {
    expect(formatMatchScore(100)).toBe('100%');
    expect(formatMatchScore('100')).toBe('100%');
  });

  it('handles null, undefined, empty string and NaN gracefully', () => {
    expect(formatMatchScore(null)).toBe('0%');
    expect(formatMatchScore(undefined)).toBe('0%');
    expect(formatMatchScore('')).toBe('0%');
    expect(formatMatchScore('invalid')).toBe('0%');
  });

  it('supports custom options (without symbol or custom fallback)', () => {
    expect(formatMatchScore(94, { includeSymbol: false })).toBe('94');
    expect(formatMatchScore(null, { fallback: 'N/A' })).toBe('N/A');
  });

  it('normalizes numbers correctly for raw numeric usage', () => {
    expect(normalizeMatchScoreNum(0.94)).toBe(94);
    expect(normalizeMatchScoreNum(94)).toBe(94);
    expect(normalizeMatchScoreNum(0)).toBe(0);
    expect(normalizeMatchScoreNum(1)).toBe(100);
    expect(normalizeMatchScoreNum(null)).toBe(0);
  });
});
