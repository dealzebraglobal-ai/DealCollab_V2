/**
 * DealCollab — NULL industry classification for public.proposals
 * =================================================================
 * Run with:   npx tsx scripts/classify-null-industries.ts            (preview only, writes JSON report)
 * Then apply: npx tsx scripts/classify-null-industries.ts --apply    (updates HIGH-confidence rows only)
 *
 * Never overwrites a non-NULL industry. Never guesses — LOW confidence and
 * anything the model can't ground in the actual text is left NULL.
 */
import { Client } from 'pg';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const APPLY = process.argv.includes('--apply');
const RETRY_FAILED = process.argv.includes('--retry-failed');
const REPORT_PATH = path.join(process.cwd(), 'scripts', 'industry-classification-report.json');
const CONCURRENCY = RETRY_FAILED ? 2 : 8;

interface Row {
  id: string;
  intent: string | null;
  sectors: string[] | null;
  geographies: string[] | null;
  metadata: Record<string, unknown> | null;
  summary_text: string | null;
  raw_text: string | null;
}

interface Classification {
  proposal_id: string;
  current_industry: null;
  detected_industry: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  source: string;
  reason: string;
}

// Collapses PDF-extraction artifacts like "S T R A T E G I C" -> "STRATEGIC"
// without touching normal text (only runs where >=4 consecutive single-char
// tokens appear, which never happens in real prose).
function despace(text: string): string {
  return text.replace(/(?:\b[A-Za-z]\b[ \t]+){3,}\b[A-Za-z]\b/g, (m) =>
    m.split(/\s+/).join('')
  );
}

async function classifyOne(groq: Groq, row: Row): Promise<Classification> {
  const raw = despace((row.raw_text || '').slice(0, 2000));
  const summary = (row.summary_text || '').slice(0, 800);
  const meta = JSON.stringify(row.metadata || {}).slice(0, 500);

  const prompt = `You are classifying the INDUSTRY of an M&A deal proposal for DealCollab, an Indian M&A deal-sourcing platform.

INDUSTRY means the specific line of business (e.g. "Home Textiles", "Toys", "IT Services", "Food Processing", "Pharmaceutical Manufacturing", "Sheet Metal Fabrication") — NOT a coarse bucket like "Manufacturing" or "FMCG" unless the source genuinely gives no more specific detail. NEVER confuse industry with business model (e.g. "Contract Manufacturing" is a business model, not an industry — if the underlying product is textiles, industry = "Home Textiles", business_model = "Contract Manufacturing").

Source data:
INTENT: ${row.intent}
GEOGRAPHIES: ${(row.geographies || []).join(', ') || 'none'}
SECTORS FIELD: ${(row.sectors || []).join(', ') || 'none'}
SUMMARY: ${summary || 'none'}
METADATA: ${meta}
RAW TEXT (may contain OCR/extraction noise): ${raw || 'none'}

Rules:
- If the text gives a clear, specific industry, return it with confidence HIGH.
- If the text gives a plausible but less certain industry (e.g. inferred from a company name or vague description), return confidence MEDIUM.
- If there is only a weak hint, return confidence LOW.
- If there is truly no usable evidence (boilerplate template, empty content, unrelated chit-chat, generic "any company available" messages), return detected_industry null and confidence NONE.
- Do NOT invent an industry that is not supported by the text. Do NOT default to "Manufacturing" or "FMCG" as a fallback guess.

Respond with ONLY strict JSON, no markdown:
{"detected_industry": string|null, "confidence": "HIGH"|"MEDIUM"|"LOW"|"NONE", "reason": string}`;

  try {
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 300,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
    });
    const content = res.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return {
      proposal_id: row.id,
      current_industry: null,
      detected_industry: parsed.detected_industry || null,
      confidence: parsed.confidence || 'NONE',
      source: 'ai_classification(raw_text+summary+metadata)',
      reason: parsed.reason || '',
    };
  } catch (err) {
    return {
      proposal_id: row.id,
      current_industry: null,
      detected_industry: null,
      confidence: 'NONE',
      source: 'ai_classification(raw_text+summary+metadata)',
      reason: `classification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set. Aborting.');
    process.exit(1);
  }
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Open a fresh connection just to fetch rows, then close it — the classify
  // loop below can run for 10+ minutes and Supabase's pooler resets idle
  // connections, which previously crashed the whole run via an unhandled
  // 'error' event on the pg Client mid-loop. A second, fresh connection is
  // opened later only for the UPDATE phase.
  const fetchClient = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  fetchClient.on('error', (err) => console.error('[pg] fetch connection error (ignored):', err.message));
  await fetchClient.connect();
  const { rows: allRows } = await fetchClient.query<Row>(`
    SELECT id, intent, sectors, geographies, metadata, summary_text, raw_text
    FROM proposals WHERE industry IS NULL ORDER BY created_at ASC;
  `);
  await fetchClient.end();

  let priorResults: Classification[] = [];
  let rows = allRows;
  if (RETRY_FAILED && fs.existsSync(REPORT_PATH)) {
    priorResults = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    const failedIds = new Set(
      priorResults.filter(r => /429|rate limit/i.test(r.reason)).map(r => r.proposal_id)
    );
    rows = allRows.filter(r => failedIds.has(r.id));
    console.log(`Retrying ${rows.length} previously rate-limited rows (of ${priorResults.length} total)...`);
  } else {
    console.log(`Classifying ${rows.length} NULL-industry proposals...`);
  }

  const results: Classification[] = [];
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(r => classifyOne(groq, r)));
    results.push(...batchResults);
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}`);
    // Snapshot after every batch so a crash mid-run (network blip, rate
    // limit exhaustion) loses at most one batch, not the whole pass.
    const snapshot = RETRY_FAILED
      ? priorResults.map(prior => results.find(r => r.proposal_id === prior.proposal_id) || prior)
      : results;
    fs.writeFileSync(REPORT_PATH, JSON.stringify(snapshot, null, 2));
    if (RETRY_FAILED) await new Promise(res => setTimeout(res, 1500));
  }
  console.log('\nDone classifying.');

  const finalResults = RETRY_FAILED
    ? priorResults.map(prior => results.find(r => r.proposal_id === prior.proposal_id) || prior)
    : results;

  fs.writeFileSync(REPORT_PATH, JSON.stringify(finalResults, null, 2));
  console.log(`Full report written to ${REPORT_PATH}`);

  const byConfidence: Record<string, number> = {};
  for (const r of finalResults) byConfidence[r.confidence] = (byConfidence[r.confidence] || 0) + 1;
  console.log('\nConfidence breakdown:', byConfidence);
  const stillRateLimited = finalResults.filter(r => /429|rate limit/i.test(r.reason)).length;
  console.log('Still rate-limited (re-run with --retry-failed):', stillRateLimited);

  console.log('\n--- Sample (first 15 non-NONE) ---');
  console.log('proposal_id | detected_industry | confidence | reason');
  for (const r of finalResults.filter(r => r.confidence !== 'NONE').slice(0, 15)) {
    console.log(`${r.proposal_id} | ${r.detected_industry} | ${r.confidence} | ${r.reason.slice(0, 80)}`);
  }

  const toApply = finalResults.filter(r => r.confidence === 'HIGH' && r.detected_industry);
  console.log(`\n${toApply.length} rows qualify for UPDATE (confidence=HIGH, detected_industry not null).`);

  if (!APPLY) {
    console.log('\nDRY RUN — no database changes made. Re-run with --apply to write these updates.');
    return;
  }

  console.log('\nApplying updates...');
  const applyClient = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  applyClient.on('error', (err) => console.error('[pg] apply connection error (ignored):', err.message));
  await applyClient.connect();
  let applied = 0;
  for (const r of toApply) {
    const res = await applyClient.query(
      `UPDATE proposals SET industry = $1, updated_at = now() WHERE id = $2 AND industry IS NULL`,
      [r.detected_industry, r.proposal_id]
    );
    if (res.rowCount && res.rowCount > 0) applied++;
  }
  console.log(`Applied ${applied} updates.`);
  await applyClient.end();
}

main().catch(e => { console.error(e); process.exit(1); });
