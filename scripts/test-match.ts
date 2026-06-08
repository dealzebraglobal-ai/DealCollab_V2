// scripts/test-match.ts
// Run: npx tsx scripts/test-match.ts <proposal-id>
// Triggers matchmaking directly via the engine. No HTTP, no auth, no curl.

import fs from 'fs';
import path from 'path';

// Load env manually (checks .env.local first, then .env)
const envs = ['.env.local', '.env'];
for (const e of envs) {
    const envPath = path.resolve(process.cwd(), e);
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
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
import { executeMatchmaking } from '../src/lib/matchmakingEngine';
import type { DealIntent, SectorKey } from '../src/lib/promptRouter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const proposalId = process.argv[2];
if (!proposalId) {
    console.error('Usage: npx tsx scripts/test-match.ts <proposal-id>');
    process.exit(1);
}

async function main() {
    // Fetch the proposal
    const { data: p, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

    if (error || !p) {
        console.error('Proposal not found:', error?.message);
        process.exit(1);
    }

    console.log('═══ INPUT PROPOSAL ═══');
    console.log(`  ID:        ${p.id}`);
    console.log(`  Intent:    ${p.intent}`);
    console.log(`  Sectors:   ${p.sectors?.join(', ') || 'none'}`);
    console.log(`  Geography: ${p.geographies?.join(', ') || 'none'}`);
    console.log(`  Size:      ${p.deal_size_min_cr}-${p.deal_size_max_cr} Cr`);
    console.log(`  Quality:   tier ${p.quality_tier}, score ${p.quality_score}`);
    console.log(`  Embedding: ${p.embedding_status}`);

    // Clear old matches for a clean test
    const { error: delErr } = await supabase
        .from('proposal_matches')
        .delete()
        .eq('proposal_id', proposalId);
    if (delErr) console.warn('  (delete old matches:', delErr.message, ')');

    console.log('\n═══ RUNNING MATCHMAKING ═══');
    const t0 = Date.now();

    const result = await executeMatchmaking({
        mandateId: p.id,
        userId: p.user_id,
        intent: p.intent || '',
        raw_text: p.raw_text || '',
        sector: (p.sectors?.[0] ?? null) as SectorKey | null,
        sub_sector: null,
        geography: p.geographies?.[0] ?? null,
        deal_size: null,
        revenue: null,
        structure: p.deal_structure,
        intent_focus: null,
        industry_data: {},
        special_conditions: p.special_conditions || [],
        deal_size_min: p.deal_size_min_cr?.toString() ?? null,
        deal_size_max: p.deal_size_max_cr?.toString() ?? null,
        revenue_min: p.revenue_min_cr?.toString() ?? null,
        revenue_max: p.revenue_max_cr?.toString() ?? null,
    });

    console.log(`  completed in ${Date.now() - t0}ms`);
    console.log(`  ${result?.matchCount ?? 0} matches | top score: ${result?.topScore?.toFixed(2) ?? '0.00'}`);

    // Pull persisted matches with counterparty detail
    const { data: matches } = await supabase
        .from('proposal_matches')
        .select(`
      final_score, match_archetype, match_reason, similarity_score,
      matched_proposal_id
    `)
        .eq('proposal_id', proposalId)
        .order('final_score', { ascending: false })
        .limit(10);

    if (!matches || matches.length === 0) {
        console.log('\n⚠ Zero matches persisted.');
        return;
    }

    // Fetch counterparty details
    const ids = matches.map(m => m.matched_proposal_id);
    const { data: cps } = await supabase
        .from('proposals')
        .select('id, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, advisor_name, raw_text, quality_tier')
        .in('id', ids);

    const cpMap = new Map((cps || []).map(c => [c.id, c]));

    console.log('\n═══ TOP MATCHES ═══');
    matches.forEach((m, i) => {
        const cp = cpMap.get(m.matched_proposal_id);
        const rank = i < 3 ? `P${i + 1}` : `#${i + 1}`;
        console.log(`\n  ${rank} · ${m.match_archetype} · ${(Number(m.final_score) * 100).toFixed(0)}%  (cos ${(Number(m.similarity_score) * 100).toFixed(0)}%)`);
        console.log(`     Sectors:   ${cp?.sectors?.join(', ') || 'none'}`);
        console.log(`     Geography: ${cp?.geographies?.join(', ') || 'none'}`);
        console.log(`     Size:      ${cp?.deal_size_min_cr || '?'}-${cp?.deal_size_max_cr || '?'} Cr`);
        console.log(`     Advisor:   ${cp?.advisor_name || 'unbranded'}`);
        console.log(`     Tier:      ${cp?.quality_tier}`);
        console.log(`     Reason:    ${m.match_reason}`);
        console.log(`     Snippet:   ${(cp?.raw_text || '').slice(0, 120)}...`);
    });

    console.log(`\n✅ Done. ${matches.length} matches stored in proposal_matches.`);
}

main().catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});