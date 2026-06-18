import { describe, it, expect } from 'vitest';
import {
  detectSectorFromText,
  detectIntentFromText,
  detectIntermediaryFromText,
  detectDealSizeFromText,
  detectRevenueFromText,
  detectFrictionSignal,
} from '../detectors';

describe('detectSectorFromText — correct cases (regression guards)', () => {
  it('multispeciality hospital → healthcare', () => {
    expect(detectSectorFromText('we run a multispeciality hospital')).toBe('healthcare');
  });
  it('API / bulk drug → pharma', () => {
    expect(detectSectorFromText('API and bulk drug manufacturing plant')).toBe('pharma');
  });
  it('solar EPC → renewable', () => {
    expect(detectSectorFromText('solar EPC company')).toBe('renewable');
  });
  it('energy drink brand → consumer (order saves this one)', () => {
    expect(detectSectorFromText('energy drink brand')).toBe('consumer');
  });
});

describe('detectSectorFromText — word-boundary matching (Phase 2.4 ✓)', () => {
  it("FIXED (Phase 2.4): \"apparel\" no longer matches 'app' → consumer", () => {
    expect(detectSectorFromText('premium apparel brand')).toBe('consumer');
  });
  it("FIXED (Phase 2.4): \"arrangements\" no longer matches 'arr' → no sector", () => {
    expect(detectSectorFromText('strong margins and good arrangements')).toBeNull();
  });
  it("FIXED (Phase 2.4): \"carried\" no longer matches 'arr'; logistics wins", () => {
    expect(detectSectorFromText('logistics company, volumes carried by top clients')).toBe('logistics');
  });
});

describe('detectIntentFromText', () => {
  it('sell → SELL_SIDE', () => {
    expect(detectIntentFromText('I want to sell my company')).toBe('SELL_SIDE');
  });
  it('investor deploying capital → BUY_SIDE (RC4)', () => {
    expect(detectIntentFromText('investor mandate to deploy capital')).toBe('BUY_SIDE');
  });
  it('raise growth capital → FUNDRAISING', () => {
    expect(detectIntentFromText('we want to raise growth capital')).toBe('FUNDRAISING');
  });
  it('acquire → BUY_SIDE', () => {
    expect(detectIntentFromText('looking to acquire a business')).toBe('BUY_SIDE');
  });
});

describe('detectIntermediaryFromText', () => {
  it('"on behalf of a client" → advisor', () => {
    expect(detectIntermediaryFromText('on behalf of a client')).toBe('advisor');
  });
  it('"my company" → owner', () => {
    expect(detectIntermediaryFromText('this is my company')).toBe('owner');
  });
  it('"I am an investor" → owner (direct acquirer)', () => {
    expect(detectIntermediaryFromText('I am an investor')).toBe('owner');
  });
});

describe('detectRevenueFromText — money cue IS required (this guard exists)', () => {
  it('fires with a revenue keyword', () => {
    expect(detectRevenueFromText('revenue of 50 cr')).toBe('₹50 Cr');
    expect(detectRevenueFromText('turnover 120 crore')).toBe('₹120 Cr');
  });
  it('does not fire without a revenue keyword (conservative miss)', () => {
    expect(detectRevenueFromText('we did 50 cr last year')).toBeNull();
  });
});

describe('detectDealSizeFromText — money cue now required (Phase 2.1 ✓)', () => {
  it('reads an explicit budget with a unit', () => {
    expect(detectDealSizeFromText('budget of 50 crore')).toBe('₹50 Cr');
  });
  it('FIXED (Phase 2.1): headcount is no longer read as a deal size', () => {
    expect(detectDealSizeFromText('250 employees across 12 offices')).toBeNull();
  });
  it('FIXED (Phase 2.1): truck/warehouse counts are not deal sizes', () => {
    expect(detectDealSizeFromText('we have 12 trucks and 3 warehouses')).toBeNull();
  });
});

describe('detectFrictionSignal — tightened triggers (Phase 2.6 ✓)', () => {
  it('still fires on a genuine proceed / done phrase', () => {
    expect(detectFrictionSignal('go ahead')).toBe(true);
    expect(detectFrictionSignal('this is enough')).toBe(true);
    expect(detectFrictionSignal("that's all I have")).toBe(true);
  });
  it('FIXED (Phase 2.6): "for now" while still answering no longer ends the chat', () => {
    expect(detectFrictionSignal('for now lets say mumbai')).toBe(false);
  });
  it('FIXED (Phase 2.6): "we want to move forward with the acquisition" is not a stop signal', () => {
    expect(detectFrictionSignal('we want to move forward with the acquisition')).toBe(false);
  });
  it('does not fire on ordinary text', () => {
    expect(detectFrictionSignal('I am raising funds')).toBe(false);
  });
});
