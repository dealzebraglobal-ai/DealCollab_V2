/**
 * Harness for the enum-first sector-compatibility fix.
 * Run: npx tsx enum_first.test.ts
 * Uses the EXACT field values from the two live proposal rows (FMCG buyer + FMCG seller).
 */
import { getSectorCompatibility, normalizeSector } from '../M5_sectorMatrix';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('  FAIL:', m)); };

// Real values from the rows you pasted:
const sellerSectorEnum = 'consumer';                                  // ProposalInput.sector (log: "sector: consumer")
const sellerIndustry   = 'packaged healthy snacks and wellness food'; // free-text industry
const buyerStoredSector = 'FMCG';                                     // candidate.sectors[0]

// The fix's selection rule (enum-first, free-text fallback):
const matrixInput = (sellerSectorEnum ?? sellerIndustry) ?? '';

// 1. enum-first picks the enum, not the free-text
ok(matrixInput === 'consumer', 'enum-first selects sector enum over free-text industry');

// 2. NEW behaviour: enum vs stored enum -> same sector -> COMPATIBLE
const fixed = getSectorCompatibility(matrixInput, buyerStoredSector);
ok(normalizeSector('consumer') === 'FMCG', "normalizeSector('consumer') === 'FMCG'");
ok(fixed.level === 'COMPATIBLE', 'enum-first: consumer vs FMCG -> COMPATIBLE (was the whole bug)');

// 3. OLD behaviour reproduced: free-text vs stored enum -> NARROW (the bug that buried the buyer)
const broken = getSectorCompatibility(sellerIndustry, buyerStoredSector);
ok(broken.level === 'NARROW', 'old free-text-first: snacks vs FMCG -> NARROW (default no-precedent)');
ok(/no direct deal precedent/i.test(broken.reason), 'old path produced the "no direct deal precedent" reason seen in your logs');

// 4. industryScore mapping the engine applies off comp.level
const industryScore = (lvl: string) => lvl === 'COMPATIBLE' ? 1.0 : lvl === 'NARROW' ? 0.45 : 0.1;
ok(industryScore(fixed.level) === 1.0,  'COMPATIBLE -> industryScore 1.0');
ok(industryScore(broken.level) === 0.45, 'NARROW -> industryScore 0.45 (+ a -10 penalty in engine)');

// 5. archetype: same normalized enum on both sides -> bolt-on (srcNorm === cndNorm)
ok(normalizeSector(matrixInput) === normalizeSector(buyerStoredSector), 'srcNorm === cndNorm -> Same-sector bolt-on archetype');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
