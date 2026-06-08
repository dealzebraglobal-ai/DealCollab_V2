/**
 * DealCollab — Inject Ayush's High-Quality Deals
 * ================================================
 * Usage:
 *   npx tsx scripts/inject-ayush-deals.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * Safety: Already-injected deals (by ref_code) are automatically skipped on re-run.
 *
 * To add new deals: edit the AYUSH_DEALS array below and re-run.
 * Each deal requires a unique ref_code (used as idempotency key).
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const BATCH_SIZE = 5;
const DELAY_MS = 600;
const MAX_TEXT_CHARS = 7000;

// ─── Deal data provided by Ayush ─────────────────────────────────────────────
// Instructions: fill in each entry with real deal data.
// ref_code must be unique across all entries (used for idempotency).
//
// Valid intent values:    SELL_SIDE | BUY_SIDE | FUNDRAISING | DEBT | STRATEGIC_PARTNERSHIP
// Valid sector values:    pharma | manufacturing | saas | finserv | consumer | realestate |
//                         logistics | education | chemicals | hospitality | renewable |
//                         defence | oil_gas | ngo | mixed
// deal_structure:         "Full Acquisition" | "Majority Stake" | "Minority Stake" | "Asset Sale"
// All financial values in Crore INR (numeric)
interface AyushDeal {
    ref_code: string;
    intent: string;
    sector: string;
    sub_sector?: string;
    geography: string;
    deal_structure?: string;
    deal_size_min_cr?: number;
    deal_size_max_cr?: number;
    revenue_min_cr?: number;
    revenue_max_cr?: number;
    advisor_name?: string;
    contact_phone?: string;
    raw_text: string;       // Free-form deal description (used for raw_text column)
    special_conditions?: string[];
    quality_score?: number; // Override if known; else computed
}

const AYUSH_DEALS: AyushDeal[] = [
    // ── TEMPLATE — replace with real deals ──
    // {
    //     ref_code: 'AYUSH-001',
    //     intent: 'SELL_SIDE',
    //     sector: 'pharma',
    //     geography: 'Gujarat',
    //     deal_structure: 'Full Acquisition',
    //     deal_size_min_cr: 80,
    //     deal_size_max_cr: 120,
    //     revenue_min_cr: 50,
    //     revenue_max_cr: 70,
    //     advisor_name: 'Ayush Sharma',
    //     contact_phone: '+91XXXXXXXXXX',
    //     raw_text: 'WHO-certified pharma manufacturer in Gujarat. Revenue ₹65 Cr, EBITDA 18%. Full acquisition preferred at ₹80-120 Cr.',
    // },
    // {
    //     ref_code: 'AYUSH-002',
    //     intent: 'BUY_SIDE',
    //     sector: 'manufacturing',
    //     geography: 'Maharashtra',
    //     deal_size_min_cr: 50,
    //     deal_size_max_cr: 200,
    //     raw_text: 'PE fund looking to acquire manufacturing businesses in Maharashtra. Budget ₹50-200 Cr. Majority stake preferred.',
    // },
];

// ─── Sector normalization (mirrors M5_sectorMatrix.ts) ───────────────────────
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

function buildDealText(d: AyushDeal): string {
    const parts: string[] = [];
    parts.push(d.intent);
    parts.push(normSector(d.sector));
    if (d.sub_sector) parts.push(d.sub_sector);
    parts.push(d.geography);
    if (d.deal_structure) parts.push(d.deal_structure);
    if (d.deal_size_min_cr != null || d.deal_size_max_cr != null) {
        parts.push(`deal size ${d.deal_size_min_cr ?? '?'} to ${d.deal_size_max_cr ?? '?'} crore`);
    }
    if (d.revenue_min_cr != null || d.revenue_max_cr != null) {
        parts.push(`revenue ${d.revenue_min_cr ?? '?'} to ${d.revenue_max_cr ?? '?'} crore`);
    }
    if (d.raw_text) parts.push(d.raw_text.slice(0, MAX_TEXT_CHARS));
    return parts.filter(Boolean).join(' | ');
}

function computeQualityScore(d: AyushDeal): number {
    let s = 0;
    if (d.intent) s += 2;
    if (d.sector) s += 2;
    if (d.geography) s += 1;
    if (d.deal_size_min_cr != null || d.deal_size_max_cr != null) s += 1;
    if (d.revenue_min_cr != null || d.revenue_max_cr != null) s += 1;
    if (d.deal_structure) s += 1;
    return s >= 8 ? 1 : s >= 5 ? 2 : s >= 2 ? 3 : 4;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main(): Promise<void> {
    console.log('🚀 DealCollab — Inject Ayush Deals');
    console.log('====================================');

    if (AYUSH_DEALS.length === 0) {
        console.log('⚠️  No deals defined in AYUSH_DEALS array. Add deals and re-run.');
        return;
    }

    console.log(`📋 ${AYUSH_DEALS.length} deals to process`);

    // Check which ref_codes already exist (idempotency)
    const { data: existing } = await supabase
        .from('proposals')
        .select('ref_code')
        .in('ref_code', AYUSH_DEALS.map(d => d.ref_code));

    const alreadySeeded = new Set<string>(
        (existing ?? []).map((p: { ref_code: string }) => p.ref_code).filter(Boolean)
    );
    console.log(`✅ ${alreadySeeded.size} deals already injected — skipping`);

    const todo = AYUSH_DEALS.filter(d => !alreadySeeded.has(d.ref_code));
    console.log(`⚙️  ${todo.length} deals to inject\n`);

    if (todo.length === 0) {
        console.log('✅ All deals already injected. Nothing to do.');
        return;
    }

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
        const batch = todo.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(todo.length / BATCH_SIZE)}`);

        await Promise.allSettled(batch.map(async (deal) => {
            try {
                const text = buildDealText(deal);

                const embRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: text.slice(0, MAX_TEXT_CHARS),
                });
                const embedding = embRes.data[0].embedding;

                const { data: proposal, error: insErr } = await supabase
                    .from('proposals')
                    .insert([{
                        raw_text: deal.raw_text.slice(0, 4000),
                        normalised_text: text,
                        intent: deal.intent,
                        sectors: [normSector(deal.sector)],
                        geographies: [deal.geography],
                        deal_structure: deal.deal_structure ?? null,
                        deal_size_min_cr: deal.deal_size_min_cr ?? null,
                        deal_size_max_cr: deal.deal_size_max_cr ?? null,
                        revenue_min_cr: deal.revenue_min_cr ?? null,
                        revenue_max_cr: deal.revenue_max_cr ?? null,
                        special_conditions: deal.special_conditions ?? [],
                        advisor_name: deal.advisor_name ?? null,
                        contact_phone: deal.contact_phone ?? null,
                        quality_tier: deal.quality_score ?? computeQualityScore(deal),
                        quality_score: deal.quality_score ?? (computeQualityScore(deal) === 1 ? 90 : computeQualityScore(deal) === 2 ? 70 : 50),
                        embedding_status: 'DONE',
                        status: 'ACTIVE',
                        source: 'AYUSH_CURATED',
                        ref_code: deal.ref_code,
                        metadata: { injected_by: 'ayush', injected_at: new Date().toISOString() },
                    }])
                    .select('id')
                    .single();

                if (insErr) throw new Error(`Insert failed: ${insErr.message}`);

                await supabase.rpc('update_proposal_embedding', {
                    proposal_id: proposal!.id,
                    embedding_vector: embedding,
                });

                processed++;
                console.log(`  ✅ ${deal.ref_code} → ${proposal!.id}`);

            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`  ❌ FAILED ${deal.ref_code}: ${msg}`);
                failed++;
            }
        }));

        if (i + BATCH_SIZE < todo.length) await sleep(DELAY_MS);
    }

    console.log('\n====================================');
    console.log('📊 INJECT COMPLETE');
    console.log(`  ✅ Processed: ${processed}`);
    console.log(`  ❌ Failed:    ${failed}`);
    if (failed > 0) {
        console.log('\n⚠️  Some deals failed. Re-run — already-done deals are skipped.');
    } else {
        console.log('\n🎉 All deals injected into matchmaking pool.');
    }
}

main().catch(err => {
    console.error('💥 Script crashed:', err);
    process.exit(1);
});
