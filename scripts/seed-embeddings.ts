/**
 * DealCollab — Seed Embeddings Script
 * =====================================
 * Place at: src/scripts/seed-embeddings.ts
 *
 * Run AFTER executing 20260514_matchmaking.sql in Supabase SQL Editor.
 *
 * Usage:
 *   npx tsx src/scripts/seed-embeddings.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * Runtime:  ~30 minutes for 1,599 mandates
 * Cost:     ~₹3 (OpenAI text-embedding-3-small)
 * Safety:   Already-seeded mandates are automatically skipped on re-run
 *
 * What it does:
 *   1. Reads all ACTIVE mandates from the mandates table
 *   2. Skips any that already have a matching proposal record (idempotent)
 *   3. Builds clean canonical text (V2: no raw conversational noise)
 *   4. Generates OpenAI embedding
 *   5. Inserts proposal record + stores embedding
 *   6. Processes in batches of 10 with rate-limit delay
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ─── Environment ──────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL');
    console.error('   SUPABASE_SERVICE_ROLE_KEY');
    console.error('   OPENAI_API_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// ─── Config ───────────────────────────────────────────────────
const BATCH_SIZE = 10;
const DELAY_MS = 600;   // between batches — avoids OpenAI 429s
const MAX_TEXT_CHARS = 7000;  // embedding input limit

// ─── Sector normalization (mirrors M5_sectorMatrix.ts) ────────
const SECTOR_NORM: Record<string, string> = {
    pharma: 'PHARMACEUTICALS', pharmaceutical: 'PHARMACEUTICALS',
    healthcare: 'HEALTHCARE', hospital: 'HEALTHCARE',
    manufacturing: 'MANUFACTURING', industrial: 'MANUFACTURING',
    saas: 'TECHNOLOGY', software: 'TECHNOLOGY', technology: 'TECHNOLOGY',
    finserv: 'FINTECH', nbfc: 'NBFC', fintech: 'FINTECH',
    consumer: 'FMCG', fmcg: 'FMCG', retail: 'RETAIL',
    realestate: 'REAL_ESTATE', 'real estate': 'REAL_ESTATE',
    logistics: 'LOGISTICS',
    education: 'EDUCATION',
    chemicals: 'CHEMICALS',
    hospitality: 'HOTELS', hotel: 'HOTELS',
    renewable: 'RENEWABLE_ENERGY', solar: 'RENEWABLE_ENERGY', wind: 'RENEWABLE_ENERGY',
    defence: 'DEFENCE', defense: 'DEFENCE',
    oil_gas: 'OIL_GAS',
    ngo: 'NGO',
};

function normSector(raw: string): string {
    if (!raw) return 'GENERAL';
    const lower = raw.toLowerCase().trim();
    return SECTOR_NORM[lower] ?? raw.toUpperCase().replace(/[\s-]+/g, '_');
}

// ─── Canonical text builder ────────────────────────────────────
// V2: structured fields only — no raw WhatsApp/conversational text
function buildSeededText(m: Record<string, unknown>): string {
    const parts: string[] = [];

    const intent = m.intent as string | null;
    const sectors = (m.sectors as string[] | null) ?? [];
    const geos = (m.geographies as string[] | null) ?? [];
    const struct = m.deal_structure as string | null;
    const norm = m.normalised_text as string | null;

    if (intent) parts.push(intent);
    if (sectors.length) parts.push(normSector(sectors[0]));
    if (sectors[0] && normSector(sectors[0]) !== sectors[0].toUpperCase()) {
        parts.push(sectors[0]);
    }
    if (geos.length) parts.push(geos[0]);
    if (struct) parts.push(struct);

    const sMin = m.deal_size_min_cr;
    const sMax = m.deal_size_max_cr;
    if (sMin != null || sMax != null) {
        parts.push(`deal size ${sMin ?? '?'} to ${sMax ?? '?'} crore`);
    }

    const rMin = m.revenue_min_cr;
    const rMax = m.revenue_max_cr;
    if (rMin != null || rMax != null) {
        parts.push(`revenue ${rMin ?? '?'} to ${rMax ?? '?'} crore`);
    }

    // Use normalised_text only if it looks like clean structured text
    // (not raw WhatsApp messages or free-form conversational input)
    if (norm && norm.length > 10 && norm.length < 500 &&
        !norm.includes('{"') && !norm.startsWith('{')) {
        parts.push(norm.slice(0, MAX_TEXT_CHARS));
    }

    return parts.filter(Boolean).join(' | ');
}

// ─── Quality tier scoring ──────────────────────────────────────
function qualityTier(m: Record<string, unknown>): number {
    let s = 0;
    if (m.intent) s += 2;
    if ((m.sectors as string[] | null)?.length) s += 2;
    if ((m.geographies as string[] | null)?.length) s += 1;
    if (m.deal_size_min_cr != null || m.deal_size_max_cr != null) s += 1;
    if (m.revenue_min_cr != null || m.revenue_max_cr != null) s += 1;
    if (m.deal_structure) s += 1;
    return s >= 8 ? 1 : s >= 5 ? 2 : s >= 2 ? 3 : 4;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────
async function main(): Promise<void> {
    console.log('🚀 DealCollab — Seed Embeddings');
    console.log('===================================');
    console.log(`Batch size: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms\n`);

    // Step 1: Fetch all ACTIVE mandates
    const { data: mandates, error: fetchErr } = await supabase
        .from('mandates')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true });

    if (fetchErr || !mandates) {
        console.error('❌ Failed to fetch mandates:', fetchErr);
        process.exit(1);
    }
    console.log(`📋 ${mandates.length} ACTIVE mandates found`);

    // Step 2: Find already-seeded mandates
    const { data: existing } = await supabase
        .from('proposals')
        .select('mandate_id')
        .not('mandate_id', 'is', null)
        .eq('embedding_status', 'DONE');

    const seeded = new Set<string>(
        (existing ?? []).map((p: { mandate_id: string }) => p.mandate_id).filter(Boolean)
    );
    console.log(`✅ ${seeded.size} mandates already seeded — skipping`);

    const todo = mandates.filter(m => !seeded.has(m.id));
    console.log(`⚙️  ${todo.length} mandates to process\n`);

    if (todo.length === 0) {
        console.log('✅ All mandates already seeded. Nothing to do.');
        return;
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // Step 3: Process in batches
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
        const batch = todo.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(todo.length / BATCH_SIZE);
        console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} mandates)`);

        await Promise.allSettled(batch.map(async (mandate) => {
            try {
                const m = mandate as Record<string, unknown>;
                const text = buildSeededText(m);

                if (text.length < 15) {
                    console.log(`  ⏭️  SKIP ${mandate.id} — text too thin (${text.length} chars)`);
                    skipped++;
                    return;
                }

                // Generate embedding
                const embRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: text.slice(0, MAX_TEXT_CHARS),
                });
                const embedding = embRes.data[0].embedding;

                // Normalize sectors
                const rawSectors = (m.sectors as string[] | null) ?? [];
                const normSectors = rawSectors.map(s => normSector(s));
                const rawGeos = (m.geographies as string[] | null) ?? [];

                // Insert proposal record
                const { data: proposal, error: insErr } = await supabase
                    .from('proposals')
                    .insert([{
                        user_id: m.user_id ?? null,
                        mandate_id: mandate.id,
                        raw_text: ((m.raw_text as string) || text).slice(0, 1000),
                        normalised_text: text,
                        intent: m.intent ?? null,
                        sectors: normSectors,
                        geographies: rawGeos,
                        deal_structure: m.deal_structure ?? null,
                        deal_size_min_cr: m.deal_size_min_cr ?? null,
                        deal_size_max_cr: m.deal_size_max_cr ?? null,
                        revenue_min_cr: m.revenue_min_cr ?? null,
                        revenue_max_cr: m.revenue_max_cr ?? null,
                        special_conditions: (m.special_conditions as string[] | null) ?? [],
                        fraud_flags: (m.fraud_flags as string[] | null) ?? [],
                        quality_tier: qualityTier(m),
                        quality_score: 5,
                        embedding_status: 'DONE',
                        status: 'ACTIVE',
                        source: 'SEEDED',
                    }])
                    .select('id')
                    .single();

                if (insErr) throw new Error(`Insert failed: ${insErr.message}`);

                // Store embedding via RPC
                await supabase.rpc('update_proposal_embedding', {
                    proposal_id: proposal!.id,
                    embedding_vector: embedding,
                });

                processed++;
                if (processed % 20 === 0 || processed === todo.length) {
                    console.log(`  ✅ ${processed}/${todo.length} processed`);
                }

            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`  ❌ FAILED ${mandate.id}: ${msg}`);
                failed++;
            }
        }));

        // Rate limiting delay between batches
        if (i + BATCH_SIZE < todo.length) await sleep(DELAY_MS);
    }

    // Summary
    console.log('\n===================================');
    console.log('📊 SEED COMPLETE');
    console.log(`  ✅ Processed: ${processed}`);
    console.log(`  ⏭️  Skipped:   ${skipped}`);
    console.log(`  ❌ Failed:    ${failed}`);
    console.log(`  📋 Total:     ${todo.length}`);

    if (failed > 0) {
        console.log('\n⚠️  Some mandates failed. Re-run the script — already-done mandates are skipped.');
    } else {
        console.log('\n🎉 All mandates seeded. Matchmaking engine is ready.');
    }
}

main().catch(err => {
    console.error('💥 Script crashed:', err);
    process.exit(1);
});