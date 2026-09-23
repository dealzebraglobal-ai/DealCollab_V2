/**
 * Harness — M5_industryGate.ts (HR-9 true-industry gate)
 * Run: npx tsx src/lib/M5_industryGate.harness.ts   (exit code 1 on any failure)
 * Pure logic only. Real embedding similarity is NOT tested here: run scripts/calibrateIndustryGate.ts.
 */
import { INDUSTRY_GATE_MIN, trueIndustry, cosineSimilarity, industryGate } from './M5_industryGate';

let failed = 0;
function check(name: string, ok: boolean): void {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) failed++;
}

// trueIndustry: the real label survives; the sector fallback and blanks do not
check('real industry kept', trueIndustry('Flexible Packaging', 'PHARMACEUTICALS') === 'Flexible Packaging');
check('sector fallback (industry = sectors[1]) dropped', trueIndustry('PHARMACEUTICALS', 'PHARMACEUTICALS') === null);
check('sector fallback in another spelling dropped', trueIndustry('pharma', 'PHARMACEUTICALS') === null);
check('blank / whitespace / null dropped', trueIndustry('  ', 'pharma') === null && trueIndustry(null, 'pharma') === null);
check('industry kept when no sector tag', trueIndustry('Cold Chain Warehousing', null) === 'Cold Chain Warehousing');
check('precise pharma industry is not mistaken for the tag',
    trueIndustry('Pharmaceutical Contract Manufacturing', 'pharma') === 'Pharmaceutical Contract Manufacturing');

// cosineSimilarity
check('identical vectors = 1', Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
check('orthogonal vectors = 0', cosineSimilarity([1, 0], [0, 1]) === 0);
check('zero vector = 0, not NaN', cosineSimilarity([0, 0], [1, 1]) === 0);

// industryGate — the reported case, with similarities standing in for real embeddings
const cdmo = 'Pharmaceutical Contract Manufacturing';
check('different business rejected (packaging for a CDMO buyer)', industryGate(cdmo, 'Flexible Packaging', 0.31).rejected);
check('same business passes', !industryGate(cdmo, 'Pharma Formulations CDMO', 0.74).rejected);
check('exactly at the cutoff passes', !industryGate(cdmo, 'X', INDUSTRY_GATE_MIN).rejected);
check('just below the cutoff rejected', industryGate(cdmo, 'X', INDUSTRY_GATE_MIN - 0.001).rejected);
check('candidate with unknown industry rejected', industryGate(cdmo, null, null).rejected);
check('missing similarity fails closed', industryGate(cdmo, 'Pharma Formulations CDMO', null).rejected);
check('generalist mandate (no industry) is not gated', !industryGate(null, 'Flexible Packaging', null).rejected);
check('reject reason names both industries',
    (industryGate(cdmo, 'Flexible Packaging', 0.31).reason ?? '').includes('"Flexible Packaging" vs "Pharmaceutical Contract Manufacturing"'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);