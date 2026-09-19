/**
 * DealCollab — PROBE 0: can industry-label similarity gate matches?
 * ==================================================================
 * Place at: scripts/probe-industry-separation.ts
 * Run with: OPENAI_API_KEY=... npx tsx scripts/probe-industry-separation.ts
 *
 * READ-ONLY. Touches no database. Writes nothing. Calls the embeddings API
 * only. ~40 short embeddings on text-embedding-3-small — fractions of a cent.
 *
 * THE QUESTION IT DECIDES
 * -----------------------
 * The owner's rule is that industry agreement is a HARD requirement, with
 * these rulings:
 *     Garments-Outerwear  ↔ Garments-Innerwear     ACCEPT
 *     API                 ↔ Formulations / CDMO    ACCEPT
 *     Home Textiles       ↔ Apparel / Garments     REJECT
 *     Sheet Metal Fab     ↔ Plastic Injection Mld  REJECT
 *
 * If ONE cosine cutoff on the industry label alone reproduces every ruling,
 * the gate is a threshold and the build is small.
 * If it does not, we need a canonical industry code list plus a curated
 * adjacency matrix defaulting to REJECT — a materially bigger build.
 *
 * SECTION B additionally embeds the SAME pairs the way buildCanonicalText()
 * does today (intent + coarse sector + geography + deal-size boilerplate) so
 * the cosine collapse caused by that boilerplate is measured, not asserted.
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import {
  cosine, findBestThreshold, INDUSTRY_PAIRS,
  type ScoredPair, type IndustryPair,
} from './lib/industrySeparation';

// Load env files (.env.local, then .env)
const envFiles = ['.env.local', '.env'];
for (const e of envFiles) {
  const ep = path.resolve(process.cwd(), e);
  if (fs.existsSync(ep)) {
    const envFile = fs.readFileSync(ep, 'utf8');
    envFile.split('\n').forEach((line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...value] = trimmed.split('=');
      if (key && value.length > 0) {
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    });
  }
}

const MODEL = 'text-embedding-3-small';

/**
 * Two of the real audit failures, rendered exactly as buildCanonicalText()
 * renders them today. Same business pairs as the industry-only test above,
 * so the two numbers are directly comparable.
 */
const CANONICAL_CONTRAST: Array<{ label: string; a: string; b: string }> = [
  {
    label: 'Audit Q1 → P1 (shown to the user as 85%)',
    a: 'SELL_SIDE | MANUFACTURING | pan-India, excluding states with significant labour union presence | revenue 100 to ? crore',
    b: 'SELL_SIDE | MANUFACTURING | India | Business Sale | deal size 35 to 75 crore',
  },
  {
    label: 'Audit Q5 → P1 (shown to the user as 75%)',
    a: 'BUY_SIDE | PHARMACEUTICALS | Solan, Himachal Pradesh | 100% / Full Buyout | revenue 77 crore',
    b: 'BUY_SIDE | TECHNOLOGY | Pune, Maharashtra | 100% / Full Buyout | deal size 150 to 200 crore',
  },
];

async function embedAll(openai: OpenAI, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await openai.embeddings.create({
      model: MODEL,
      input: texts.slice(i, i + BATCH),
    });
    res.data.sort((x, y) => x.index - y.index).forEach(d => out.push(d.embedding));
  }
  return out;
}

function bar(cos: number): string {
  return '█'.repeat(Math.max(0, Math.round(cos * 40))).padEnd(40, '·');
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set. Aborting — this probe embeds nothing without it.');
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // ── SECTION A: industry label alone ─────────────────────────────────
  const labels: string[] = Array.from(new Set(INDUSTRY_PAIRS.flatMap((p: IndustryPair) => [p.a, p.b])));
  const vecs = await embedAll(openai, labels);
  const byLabel = new Map<string, number[]>(labels.map((l, i) => [l, vecs[i]]));

  const scored: ScoredPair[] = INDUSTRY_PAIRS.map((p: IndustryPair) => ({
    ...p,
    cos: cosine(byLabel.get(p.a)!, byLabel.get(p.b)!),
  }));

  console.log(`\n=== SECTION A — INDUSTRY LABEL ONLY (${MODEL}) ===\n`);
  for (const p of [...scored].sort((x, y) => y.cos - x.cos)) {
    const tag = p.expect.padEnd(9);
    console.log(`${p.cos.toFixed(4)} ${bar(p.cos)} ${tag} ${p.a}  ↔  ${p.b}`);
  }

  const rep = findBestThreshold(scored);
  console.log(`\n--- VERDICT ---`);
  console.log(`  lowest  ACCEPT cosine : ${rep.minAccept.toFixed(4)}`);
  console.log(`  highest REJECT cosine : ${rep.maxReject.toFixed(4)}`);
  console.log(`  margin (accept-reject): ${rep.margin >= 0 ? '+' : ''}${rep.margin.toFixed(4)}`);
  console.log(`  best cutoff           : ${rep.threshold?.toFixed(4) ?? 'n/a'}  (${rep.correct}/${rep.total} correct)`);
  if (rep.separable) {
    console.log(`\n  SEPARABLE. A single industry-cosine gate reproduces every ruling.`);
    console.log(`  -> Build the gate as a threshold. Suggested starting cutoff: ${rep.threshold!.toFixed(3)}`);
  } else {
    console.log(`\n  NOT SEPARABLE. No single cutoff reproduces the rulings.`);
    console.log(`  -> A canonical industry code list + curated adjacency matrix is required.`);
    console.log(`  Pairs the best possible cutoff still gets wrong:`);
    for (const m of rep.misclassified) {
      console.log(`     ${m.cos.toFixed(4)}  wanted ${m.expect.padEnd(6)}  ${m.a} ↔ ${m.b}   [${m.source}]`);
    }
  }

  const undecided = scored.filter((p: ScoredPair) => p.expect === 'UNDECIDED');
  if (undecided.length) {
    console.log(`\n  Awaiting an owner ruling (excluded from the fit above):`);
    for (const u of undecided) console.log(`     ${u.cos.toFixed(4)}  ${u.a} ↔ ${u.b}`);
  }

  // ── SECTION B: what today's canonical text scores on the same deals ──
  console.log(`\n=== SECTION B — TODAY'S buildCanonicalText() ON THE SAME BUSINESSES ===\n`);
  const ctexts = CANONICAL_CONTRAST.flatMap(c => [c.a, c.b]);
  const cvecs = await embedAll(openai, ctexts);
  CANONICAL_CONTRAST.forEach((c, i) => {
    const cos = cosine(cvecs[i * 2], cvecs[i * 2 + 1]);
    console.log(`${cos.toFixed(4)} ${bar(cos)} ${c.label}`);
  });
  console.log(`\n  These are pairs the owner rules IRRELEVANT. Any value here above`);
  console.log(`  ~0.5 is the deal-parameter boilerplate manufacturing similarity`);
  console.log(`  that does not exist between the underlying businesses.`);
}

main().catch(err => { console.error('PROBE FAILED:', err); process.exit(1); });
