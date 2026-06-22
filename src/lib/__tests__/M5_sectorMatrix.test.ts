import { describe, it, expect } from 'vitest';
import { normalizeSector, getSectorCompatibility } from '../M5_sectorMatrix';

// ─────────────────────────────────────────────────────────────
// Matching half — the hard-reject (HR-4) fix.
// The DANGER was: aquaculture forced to "consumer" → normalizeSector → "FMCG", and FMCG has
// hard-incompatible pairs, so genuine matches were silently deleted. Feeding the TRUE industry
// avoids the trap (unknown industries fall to NARROW, never INCOMPATIBLE).
// ─────────────────────────────────────────────────────────────

describe('normalizeSector', () => {
  it('"consumer" maps to FMCG (the trap)', () => {
    expect(normalizeSector('consumer')).toBe('FMCG');
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
