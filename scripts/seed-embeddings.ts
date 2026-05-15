// scripts/seed-embeddings.ts
// Run: npx tsx scripts/seed-embeddings.ts
//
// Embeds every proposal with embedding_status='PENDING' and quality_tier in (1,2,3).
// Trusts the DB-assigned quality_tier (set by enrich-proposals.ts).
// Guarantees forward progress via id-based cursor (no infinite loops).

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
import OpenAI from 'openai';
import { fixEncoding } from '../src/lib/dataQuality';

const BATCH = 10;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiKey) {
    console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

interface Row {
    id: string;
    raw_text: string | null;
    normalised_text: string | null;
    intent: string | null;
    sectors: string[] | null;
    geographies: string[] | null;
    deal_structure: string | null;
    deal_size_min_cr: string | null;
    deal_size_max_cr: string | null;
    quality_tier: string | null;
}

function buildNarrative(r: Row, cleanText: string): string {
    return [
        r.intent ? `Intent: ${r.intent}` : '',
        r.sectors?.length ? `Sector: ${r.sectors.join(', ')}` : '',
        r.geographies?.length ? `Geography: ${r.geographies.join(', ')}` : '',
        r.deal_structure ? `Structure: ${r.deal_structure}` : '',
        r.deal_size_min_cr ? `Size: ₹${r.deal_size_min_cr}-${r.deal_size_max_cr || r.deal_size_min_cr} Cr` : '',
        cleanText.slice(0, 600),
    ].filter(Boolean).join('\n');
}

async function main() {
    let cursor: string | null = null;
    let processed = 0, embedded = 0, skippedTier4 = 0, errored = 0;
    const t0 = Date.now();

    while (true) {
        // CRITICAL: fetch only PENDING rows. Cursor by ID for guaranteed forward progress.
        let q = supabase
            .from('proposals')
            .select('id, raw_text, normalised_text, intent, sectors, geographies, deal_structure, deal_size_min_cr, deal_size_max_cr, quality_tier')
            .eq('embedding_status', 'PENDING')
            .order('id', { ascending: true })
            .limit(BATCH);

        if (cursor) q = q.gt('id', cursor);

        const { data: batch, error } = await q;

        if (error) { console.error('Fetch error:', error); break; }
        if (!batch || batch.length === 0) break;

        for (const row of batch as Row[]) {
            processed++;
            cursor = row.id;

            try {
                const tier = row.quality_tier ? parseInt(row.quality_tier) : 4;

                // Trust DB tier — skip Tier 4 only
                if (tier === 4 || tier === 0) {
                    await supabase.from('proposals').update({
                        embedding_status: 'SKIPPED',
                    }).eq('id', row.id);
                    skippedTier4++;
                    continue;
                }

                const cleanText = fixEncoding(row.raw_text || row.normalised_text || '');
                if (cleanText.length < 10) {
                    await supabase.from('proposals').update({
                        embedding_status: 'SKIPPED',
                    }).eq('id', row.id);
                    skippedTier4++;
                    continue;
                }

                const narrative = buildNarrative(row, cleanText);
                const resp = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: narrative,
                    dimensions: 1536,
                });
                const vec = resp.data[0].embedding;

                const { error: rpcErr } = await supabase.rpc('update_proposal_embedding', {
                    proposal_id: row.id,
                    embedding_vector: vec,
                });
                if (rpcErr) throw new Error(`RPC: ${rpcErr.message}`);

                // RPC also flips status to ACTIVE per migration 004; belt-and-braces:
                await supabase.from('proposals').update({
                    embedding_status: 'DONE',
                    updated_at: new Date().toISOString(),
                }).eq('id', row.id);

                embedded++;
            } catch (err) {
                errored++;
                console.error(`  ⚠ Row ${row.id}: ${err instanceof Error ? err.message : err}`);
                // Don't leave it as PENDING forever — mark errored so we don't retry blindly
                await supabase.from('proposals').update({
                    embedding_status: 'ERRORED',
                }).eq('id', row.id);
            }
        }

        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`Progress: processed=${processed} embedded=${embedded} skipped=${skippedTier4} errored=${errored} | ${elapsed}s`);

        // Gentle rate-limit
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n✅ DONE — processed=${processed} embedded=${embedded} skipped=${skippedTier4} errored=${errored}`);
}

main().catch(console.error);