/**
 * Calibrate INDUSTRY_GATE_MIN (src/lib/M5_industryGate.ts) on REAL embeddings.
 * Run from the repo root:  OPENAI_API_KEY=... npx tsx scripts/calibrateIndustryGate.ts
 *
 * Prints every pair's similarity with its label, then the cutoff that separates them.
 * The labels are M&A judgement calls — edit or extend PAIRS with real pairs from your deals.
 * Must use the same model as matchmakingEngine.ts embed()/embedMany().
 */
import OpenAI from 'openai';
import { cosineSimilarity } from '../src/lib/M5_industryGate';

const CDMO = 'Pharmaceutical Contract Manufacturing (Oral Solid Dosage)';
// [mandate industry, candidate industry, should they match?]
const PAIRS: Array<[string, string, boolean]> = [
    [CDMO, 'Pharmaceutical Formulations CDMO', true],
    [CDMO, 'Contract manufacturing of tablets and capsules', true],
    [CDMO, 'Loan licence manufacturing of oral solid dosage forms', true],
    [CDMO, 'Third-party pharmaceutical manufacturing', true],
    [CDMO, 'Generic tablet and capsule manufacturer', true],
    [CDMO, 'Flexible Packaging', false],
    [CDMO, 'Pharmaceutical packaging (blister foils)', false],
    [CDMO, 'Empty hard gelatin capsule shells', false],
    [CDMO, 'Pharmaceutical machinery', false],
    [CDMO, 'Pharma distribution and stockist', false],
    [CDMO, 'Active Pharmaceutical Ingredients (API) manufacturing', false], // judgement call: API ≠ oral-solid CDMO
    [CDMO, 'Multi-speciality hospital', false],
    ['Auto components manufacturing', 'Precision machined auto parts', true],
    ['Auto components manufacturing', 'Sheet metal stamping for automotive OEMs', true],
    ['Auto components manufacturing', 'Automobile dealership', false],
    ['3PL logistics and cold chain', 'Cold chain warehousing', true],
    ['3PL logistics and cold chain', 'Flexible Packaging', false],
    ['Specialty chemicals', 'Dyes and pigments manufacturing', true],
    ['Specialty chemicals', 'Pharmaceutical formulations', false],
];

async function main() {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const texts = [...new Set(PAIRS.flatMap(([a, b]) => [a, b]))];
    const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: texts });
    const vec = new Map(res.data.map(d => [texts[d.index], d.embedding]));

    const rows = PAIRS
        .map(([a, b, match]) => ({ a, b, match, sim: cosineSimilarity(vec.get(a)!, vec.get(b)!) }))
        .sort((x, y) => y.sim - x.sim);
    for (const r of rows) console.log(`${r.sim.toFixed(3)}  ${r.match ? 'MATCH   ' : 'NO MATCH'}  ${r.b}  ←  ${r.a}`);

    const minMatch = Math.min(...rows.filter(r => r.match).map(r => r.sim));
    const maxNoMatch = Math.max(...rows.filter(r => !r.match).map(r => r.sim));
    console.log(`\nlowest MATCH ${minMatch.toFixed(3)} | highest NO MATCH ${maxNoMatch.toFixed(3)}`);
    if (minMatch > maxNoMatch) {
        console.log(`Separable. Set INDUSTRY_GATE_MIN = ${((minMatch + maxNoMatch) / 2).toFixed(2)}`);
    } else {
        console.log('NOT separable: the pairs between those two values need a decision (relabel, or a stronger check).');
    }
}
main().catch(e => { console.error(e); process.exit(1); });