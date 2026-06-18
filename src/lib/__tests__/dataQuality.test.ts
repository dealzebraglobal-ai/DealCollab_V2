import { describe, it, expect } from 'vitest';
import { normalizeSize, normalizeIntent, qualityTierFromScore } from '../dataQuality';

describe('normalizeSize — correct cases (regression guards)', () => {
  it('parses ₹ single value', () => {
    expect(normalizeSize('₹50 Cr')).toEqual({ min_cr: 50, max_cr: 50 });
  });
  it('parses a hyphen range in Cr', () => {
    expect(normalizeSize('50-100 Cr')).toEqual({ min_cr: 50, max_cr: 100 });
  });
  it('parses a "to" range in crore', () => {
    expect(normalizeSize('50 to 200 crore')).toEqual({ min_cr: 50, max_cr: 200 });
  });
  it('converts lakh to Cr', () => {
    expect(normalizeSize('500 lakh')).toEqual({ min_cr: 5, max_cr: 5 });
  });
  it('converts USD millions to Cr (≈83 INR)', () => {
    expect(normalizeSize('USD 50M')).toEqual({ min_cr: 415, max_cr: 415 });
  });
  it('converts INR millions to Cr', () => {
    expect(normalizeSize('INR 100M')).toEqual({ min_cr: 10, max_cr: 10 });
  });
  it('converts INR billions to Cr', () => {
    expect(normalizeSize('1.5 billion')).toEqual({ min_cr: 150, max_cr: 150 });
  });
  it('returns null for non-financial units (MW)', () => {
    expect(normalizeSize('20 MW')).toBeNull();
  });
  it('strips ~ approximations', () => {
    expect(normalizeSize('~50 Cr')).toEqual({ min_cr: 50, max_cr: 50 });
  });
});

describe('normalizeSize — range units (Phase 2.2)', () => {
  it('FIXED (Phase 2.2): mixed-unit range parses each side independently, then sorts', () => {
    expect(normalizeSize('50 lakh-1 Cr')).toEqual({ min_cr: 0.5, max_cr: 1 });
  });
  it('by design: a bare number still parses to Cr at this low level — the money-cue guard lives in the callers (detectDealSizeFromText, Phase 2.1)', () => {
    expect(normalizeSize('250 employees across 12 offices')).toEqual({ min_cr: 250, max_cr: 250 });
  });
});

describe('normalizeIntent', () => {
  it('canonicalizes known aliases', () => {
    expect(normalizeIntent('SELL_SIDE')).toBe('SELL_SIDE');
    expect(normalizeIntent('buy')).toBe('BUY_SIDE');
    expect(normalizeIntent('invest')).toBe('BUY_SIDE'); // RC4: investor = BUY_SIDE
  });
  it('FIXED (Phase 2.3): an unknown string is rejected as null, not upcased into a fake intent', () => {
    expect(normalizeIntent('acquihire')).toBeNull();
  });
  it('FIXED (Phase 2.3): "partner" now maps to STRATEGIC_PARTNERSHIP', () => {
    expect(normalizeIntent('partner')).toBe('STRATEGIC_PARTNERSHIP');
  });
});

describe('qualityTierFromScore', () => {
  it('maps scores to tiers', () => {
    expect(qualityTierFromScore(9)).toBe(1);
    expect(qualityTierFromScore(6)).toBe(2);
    expect(qualityTierFromScore(3)).toBe(3);
    expect(qualityTierFromScore(0)).toBe(4);
  });
});
