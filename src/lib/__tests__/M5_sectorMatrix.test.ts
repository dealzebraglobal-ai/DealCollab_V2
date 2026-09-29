import { describe, it, expect } from 'vitest';
import {
  normalizeSector,
  getSectorCompatibility,
  resolveIndustryCompatibility,
  inferMandateSpecificity,
} from '../M5_sectorMatrix';

// ─────────────────────────────────────────────────────────────
// Matching half — the hard-reject (HR-4) fix.
// The DANGER was: aquaculture forced to "consumer" → normalizeSector → a coarse bucket with its
// own hard-incompatible pairs (CONSUMER|NBFC, CONSUMER|DEFENCE, CONSUMER|PHARMACEUTICALS —
// formerly the same trap under the FMCG bucket name), so genuine matches were silently deleted.
// Feeding the TRUE industry avoids the trap (unknown industries fall to NARROW, never INCOMPATIBLE).
// ─────────────────────────────────────────────────────────────

describe('normalizeSector', () => {
  it('"consumer" maps to a coarse bucket carrying its own hard-incompatible pairs (the trap)', () => {
    expect(normalizeSector('consumer')).toBe('CONSUMER');
  });
  it('a free-text industry is preserved (uppercased), not coerced into a bucket', () => {
    expect(normalizeSector('Freshwater Aquaculture')).toBe('FRESHWATER_AQUACULTURE');
  });
});

describe('getSectorCompatibility — true industry avoids the false hard-reject', () => {
  it('THE BUG: forced "consumer" vs pharma → INCOMPATIBLE (would be hard-rejected)', () => {
    expect(getSectorCompatibility('consumer', 'pharma').level).toBe('INCOMPATIBLE');
  });

  it('THE FIX: true "Freshwater Aquaculture" vs pharma → NOT incompatible (NARROW, semantics decide)', () => {
    const r = getSectorCompatibility('Freshwater Aquaculture', 'pharma');
    expect(r.level).not.toBe('INCOMPATIBLE');   // no silent deletion
    expect(r.level).toBe('NARROW');
  });

  it('two aquaculture deals → COMPATIBLE (same true industry)', () => {
    expect(getSectorCompatibility('Freshwater Aquaculture', 'Freshwater Aquaculture').level).toBe('COMPATIBLE');
  });

  it('genuinely incompatible curated pairs still hard-reject (pharma vs real estate)', () => {
    expect(getSectorCompatibility('pharma', 'realestate').level).toBe('INCOMPATIBLE');
  });

  it('unknown industry vs unknown industry (different) → NARROW default, never INCOMPATIBLE', () => {
    expect(getSectorCompatibility('Aquaculture', 'Agri Commodity Exports').level).toBe('NARROW');
  });
});

describe('MandateSpecificity & Cross-Sector Filtering', () => {
  it('inferMandateSpecificity correctly classifies HIGH, MEDIUM, LOW', () => {
    expect(inferMandateSpecificity({ industry: 'industrial valves and flow-control equipment', sector: 'manufacturing' })).toBe('HIGH');
    expect(inferMandateSpecificity({ industry: 'Pharmaceutical Contract Manufacturing', sector: 'pharma' })).toBe('HIGH');
    expect(inferMandateSpecificity({ sector: 'manufacturing', serving_sectors: ['Automotive'] })).toBe('MEDIUM');
    expect(inferMandateSpecificity({ sector: 'general' })).toBe('LOW');
  });

  it('SUPPRESSES broad cross-sector match for HIGH-specificity mandate (Valves vs Pharma CMO)', () => {
    const buyerValves = {
      industry: 'industrial valves and flow-control equipment',
      sector: 'manufacturing',
    };
    const sellerPharma = {
      industry: 'Pharmaceutical Contract Manufacturing',
      sector: 'pharma',
    };

    const result = resolveIndustryCompatibility(buyerValves, sellerPharma);
    // Must NOT be an automatic match: score must be 0.0 for cross-sector NARROW on HIGH specificity
    expect(result.score).toBe(0.0);
    expect(result.reason).toContain('Broad cross-sector match suppressed');
  });

  it('Downgrades serving-sector match from automatic 0.95 to supporting signal', () => {
    const source = {
      industry: 'industrial valves',
      sector: 'manufacturing',
      mandate_specificity: 'HIGH' as const,
    };
    const candidate = {
      industry: 'general plastic extrusion',
      sector: 'manufacturing',
      serving_sectors: ['industrial valves'],
    };

    const result = resolveIndustryCompatibility(source, candidate);
    expect(result.score).toBeLessThan(0.95);
    expect(result.score).toBe(0.40); // supporting signal for HIGH specificity
  });

  it('Retains 1.0 exact match for aligned specific industries', () => {
    const source = {
      industry: 'industrial valves and flow-control equipment',
      sector: 'manufacturing',
    };
    const candidate = {
      industry: 'industrial valves manufacturing',
      sector: 'manufacturing',
    };

    const result = resolveIndustryCompatibility(source, candidate);
    expect(result.score).toBe(1.0);
    expect(result.level).toBe('COMPATIBLE');
    expect(result.isSpecificIndustryMatch).toBe(true);
  });

  it('EXCLUDES generic operational words (Specialty Chemicals vs Precision Engineering -> NONE)', () => {
    const buyerChemicals = {
      industry: 'Specialty chemicals manufacturing',
      sector: 'chemicals',
      mandate_specificity: 'HIGH' as const,
    };
    const sellerPrecision = {
      industry: 'Precision Engineering and Component Manufacturing',
      sector: 'manufacturing',
    };

    const result = resolveIndustryCompatibility(buyerChemicals, sellerPrecision);
    // Must NOT match on the word "manufacturing"
    expect(result.score).toBe(0.0);
    expect(result.isSpecificIndustryMatch).toBe(false);
  });

  it('RECOGNIZES core niche alignment in taxonomy (Specialty Chemicals vs Agrochem Intermediates -> EXACT)', () => {
    const buyerChemicals = {
      industry: 'Specialty chemicals manufacturing',
      sector: 'chemicals',
    };
    const sellerAgro = {
      industry: 'Agrochemical Intermediates & Fine Chemicals',
      sector: 'chemicals',
    };

    const result = resolveIndustryCompatibility(buyerChemicals, sellerAgro);
    expect(result.score).toBe(1.0);
    expect(result.level).toBe('COMPATIBLE');
    expect(result.isSpecificIndustryMatch).toBe(true);
  });

  it('Target Requirement Match Gate: SUPPRESSES primary match for same coarse sector when target requirement is not satisfied (PCB vs CNC turning)', () => {
    const buyerPcb = {
      industry: 'PCB and power electronics manufacturing company around Pune',
      sector: 'manufacturing',
      mandate_specificity: 'HIGH' as const,
    };
    const sellerCnc = {
      industry: 'CNC-turned / precision engineering / auto-component manufacturing company in Pune',
      sector: 'manufacturing',
    };

    const result = resolveIndustryCompatibility(buyerPcb, sellerCnc);
    // Both are MANUFACTURING, but specific niches (PCB vs CNC) differ:
    // Industry Similarity is not the same as Target Requirement Satisfaction.
    expect(result.isSpecificIndustryMatch).toBe(false);
    expect(result.score).toBeLessThanOrEqual(0.10);
    expect(result.level).toBe('NARROW');
    expect(result.reason).toContain('does not satisfy target requirement');
  });

  it('Target Requirement Match Gate: ACCEPTS matching electronics/EMS target requirement (PCB vs EMS Assembly)', () => {
    const buyerPcb = {
      industry: 'PCB and power electronics manufacturing company around Pune',
      sector: 'manufacturing',
    };
    const sellerEms = {
      industry: 'EMS and PCB assembly manufacturing',
      sector: 'manufacturing',
    };

    const result = resolveIndustryCompatibility(buyerPcb, sellerEms);
    expect(result.score).toBe(1.0);
    expect(result.level).toBe('COMPATIBLE');
    expect(result.isSpecificIndustryMatch).toBe(true);
  });
});
