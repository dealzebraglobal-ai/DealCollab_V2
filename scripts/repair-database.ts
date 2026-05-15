// scripts/repair-database.ts
// Run: npx tsx scripts/repair-database.ts
//
// Repairs everything needed for matching to work:
//   1. Canonicalizes intent labels in proposals and mandates
//   2. Migrates mandates → proposals (rows that exist in mandates but not in proposals)
//   3. Computes quality_score + quality_tier for every proposal
//   4. Marks any proposal missing an embedding as PENDING for re-embedding
//   5. Reports row counts at every step
//
// After this script completes, run scripts/seed-embeddings.ts to embed everything.

import fs from 'fs';
import path from 'path';

// Load env manually (checks .env.local first, then .env)
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
                process.env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
            }
        });
        break; // Stop after first match
    }
}


import { createClient } from '@supabase/supabase-js';
import {
    computeQualityScore,
    fixEncoding,
    normalizeIntent,
    qualityTierFromScore
} from '../src/lib/dataQuality';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function step(label: string, fn: () => Promise<unknown>) {
    console.log(`\n▶ ${label}`);
    const t0 = Date.now();
    const result = await fn();
    console.log(`  ✓ done in ${Date.now() - t0}ms`, result ? JSON.stringify(result).slice(0, 200) : '');
}

async function main() {
    console.log('🔧 DEALCOLLAB DATABASE REPAIR\n══════════════════════════════');

    // ─── BASELINE COUNTS ───────────────────────────────────────
    await step('Baseline counts', async () => {
        const { count: pCount } = await supabase.from('proposals').select('*', { count: 'exact', head: true });
        const { count: mCount } = await supabase.from('mandates').select('*', { count: 'exact', head: true });
        return { proposals: pCount, mandates: mCount };
    });

    // ─── STEP 1: CANONICALIZE INTENT ───────────────────────────
    await step('Canonicalizing intent in proposals (BUY_SIDE/SELL_SIDE only)', async () => {
        const { data: rows } = await supabase.from('proposals').select('id, intent').limit(10000);
        let updated = 0;
        for (const r of rows || []) {
            const canonical = normalizeIntent(r.intent);
            if (canonical && canonical !== r.intent) {
                await supabase.from('proposals').update({ intent: canonical }).eq('id', r.id);
                updated++;
            }
        }
        return { rowsScanned: rows?.length || 0, updated };
    });

    await step('Canonicalizing intent in mandates', async () => {
        const { data: rows } = await supabase.from('mandates').select('id, intent').limit(10000);
        let updated = 0;
        for (const r of rows || []) {
            const canonical = normalizeIntent(r.intent);
            if (canonical && canonical !== r.intent) {
                await supabase.from('mandates').update({ intent: canonical }).eq('id', r.id);
                updated++;
            }
        }
        return { rowsScanned: rows?.length || 0, updated };
    });

    // ─── STEP 2: MIGRATE MANDATES → PROPOSALS ──────────────────
    await step('Migrating mandates not yet in proposals', async () => {
        // Get all mandates
        const { data: mandates } = await supabase
            .from('mandates')
            .select('id, user_id, raw_text, normalised_text, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, revenue_min_cr, revenue_max_cr, deal_structure, special_conditions, source, created_at');

        // Get all existing proposals' user+created pairs to avoid duplicates
        const { data: existingProposals } = await supabase
            .from('proposals')
            .select('user_id, created_at');

        const existingSet = new Set(
            (existingProposals || []).map(p => `${p.user_id}|${new Date(p.created_at).toISOString().slice(0, 19)}`)
        );

        const toInsert: Record<string, unknown>[] = [];
        for (const m of mandates || []) {
            if (!m.intent) continue; // skip orphans without intent
            const key = `${m.user_id}|${new Date(m.created_at).toISOString().slice(0, 19)}`;
            if (existingSet.has(key)) continue;

            const cleanText = fixEncoding(m.raw_text || '');
            const sizeMin = m.deal_size_min_cr ? parseFloat(m.deal_size_min_cr) : null;
            const revMin = m.revenue_min_cr ? parseFloat(m.revenue_min_cr) : null;

            const score = computeQualityScore({
                rawText: cleanText,
                intent: m.intent,
                sector: m.sectors?.[0] ?? null,
                geography: m.geographies?.[0] ?? null,
                deal_size_min_cr: sizeMin,
                revenue_min_cr: revMin,
                structure: m.deal_structure,
            });
            const tier = qualityTierFromScore(score);

            toInsert.push({
                user_id: m.user_id,
                raw_text: cleanText,
                normalised_text: cleanText,
                intent: normalizeIntent(m.intent) || m.intent,
                sectors: m.sectors || [],
                geographies: m.geographies || [],
                deal_size_min_cr: m.deal_size_min_cr,
                deal_size_max_cr: m.deal_size_max_cr,
                revenue_min_cr: m.revenue_min_cr,
                revenue_max_cr: m.revenue_max_cr,
                deal_structure: m.deal_structure,
                special_conditions: m.special_conditions || [],
                quality_score: score,
                quality_tier: tier.toString(),
                status: tier === 4 ? 'PENDING_ENRICHMENT' : 'ACTIVE',
                source: m.source || 'MIGRATED',
                embedding_status: 'PENDING',
                created_at: m.created_at,
            });
        }

        if (toInsert.length > 0) {
            // Batch insert
            for (let i = 0; i < toInsert.length; i += 50) {
                const slice = toInsert.slice(i, i + 50);
                const { error } = await supabase.from('proposals').insert(slice);
                if (error) console.error('  ⚠ insert batch error:', error.message);
            }
        }

        return { mandatesScanned: mandates?.length || 0, migrated: toInsert.length };
    });

    // ─── STEP 3: COMPUTE QUALITY SCORES FOR ALL PROPOSALS ──────
    await step('Computing quality_score for proposals missing it', async () => {
        const { data: rows } = await supabase
            .from('proposals')
            .select('id, raw_text, normalised_text, intent, sectors, geographies, deal_size_min_cr, revenue_min_cr, deal_structure, quality_score');
        let updated = 0;
        for (const r of rows || []) {
            if (r.quality_score != null) continue;
            const text = fixEncoding(r.raw_text || r.normalised_text || '');
            const score = computeQualityScore({
                rawText: text,
                intent: r.intent,
                sector: r.sectors?.[0] ?? null,
                geography: r.geographies?.[0] ?? null,
                deal_size_min_cr: r.deal_size_min_cr ? parseFloat(r.deal_size_min_cr) : null,
                revenue_min_cr: r.revenue_min_cr ? parseFloat(r.revenue_min_cr) : null,
                structure: r.deal_structure,
            });
            const tier = qualityTierFromScore(score);
            await supabase.from('proposals').update({
                quality_score: score,
                quality_tier: tier.toString(),
                status: tier === 4 ? 'PENDING_ENRICHMENT' : 'ACTIVE',
            }).eq('id', r.id);
            updated++;
        }
        return { rowsScanned: rows?.length || 0, updated };
    });

    // ─── STEP 4: MARK MISSING-EMBEDDING ROWS AS PENDING ────────
    await step('Resetting embedding_status for rows with NULL embedding', async () => {
        const { data, error } = await supabase
            .from('proposals')
            .update({ embedding_status: 'PENDING' })
            .is('embedding', null)
            .neq('embedding_status', 'PENDING')
            .neq('embedding_status', 'SKIPPED')
            .select('id');
        if (error) return { error: error.message };
        return { reset: data?.length || 0 };
    });

    // ─── FINAL COUNTS ──────────────────────────────────────────
    await step('Final state', async () => {
        const { count: total } = await supabase.from('proposals').select('*', { count: 'exact', head: true });
        const { count: pending } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('embedding_status', 'PENDING');
        const { count: active } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('embedding_status', 'ACTIVE');
        const { count: sellSide } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('intent', 'SELL_SIDE');
        const { count: buySide } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('intent', 'BUY_SIDE');
        return {
            total_proposals: total,
            embedding_pending: pending,
            embedding_active: active,
            buy_side: buySide,
            sell_side: sellSide,
        };
    });

    console.log('\n✅ REPAIR COMPLETE\n');
    console.log('Next step: npx tsx scripts/seed-embeddings.ts');
}

main().catch(err => {
    console.error('REPAIR FAILED:', err);
    process.exit(1);
});