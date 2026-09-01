import { describe, it, expect } from 'vitest';
import { getSectorCompatibility, normalizeSector } from '../M5_sectorMatrix';

describe('enum-first sector compatibility', () => {
  it('selects sector enum over free-text industry and marks compatible', () => {
    const sellerSectorEnum = 'consumer';
    const sellerIndustry = 'packaged healthy snacks and wellness food';
    const buyerStoredSector = 'FMCG';

    const matrixInput = (sellerSectorEnum ?? sellerIndustry) ?? '';
    expect(matrixInput).toBe('consumer');

    const fixed = getSectorCompatibility(matrixInput, buyerStoredSector);
    expect(normalizeSector('consumer')).toBe('FMCG');
    expect(fixed.level).toBe('COMPATIBLE');

    const broken = getSectorCompatibility(sellerIndustry, buyerStoredSector);
    expect(broken.level).toBe('NARROW');
    expect(/no direct deal precedent/i.test(broken.reason)).toBe(true);

    const industryScore = (lvl: string) => lvl === 'COMPATIBLE' ? 1.0 : lvl === 'NARROW' ? 0.45 : 0.1;
    expect(industryScore(fixed.level)).toBe(1.0);
    expect(industryScore(broken.level)).toBe(0.45);

    expect(normalizeSector(matrixInput)).toBe(normalizeSector(buyerStoredSector));
  });
});
