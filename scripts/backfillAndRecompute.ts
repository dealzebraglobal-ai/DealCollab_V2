/**
 * DealCollab — Step 9: Backfill & Recompute Utility
 * ==================================================
 * Usage:
 *   npx tsx scripts/backfillAndRecompute.ts --dry-run
 *   npx tsx scripts/backfillAndRecompute.ts --execute
 */

import { createClient } from '@supabase/supabase-js';
import { executeMatchmaking, type ProposalInput } from '../src/lib/matchmakingEngine';
import { normalizeSector } from '../src/lib/M5_sectorMatrix';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials missing from environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const isDryRun = !process.argv.includes('--execute');

async function main() {
  console.log(`\n======================================================`);
  console.log(`[BACKFILL & RECOMPUTE] Mode: ${isDryRun ? 'DRY-RUN (no persistent changes)' : 'EXECUTE (live updates)'}`);
  console.log(`======================================================\n`);

  // 1. Fetch active proposals
  const { data: proposals, error: propErr } = await supabase
    .from('proposals')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false });

  if (propErr || !proposals) {
    console.error('❌ Failed to fetch proposals:', propErr);
    process.exit(1);
  }

  console.log(`Found ${proposals.length} active proposals.\n`);

  let backfilledCount = 0;
  let recomputedCount = 0;

  for (const p of proposals) {
    const rawMeta = (p.metadata as Record<string, unknown>) || {};
    const extractedIndustry =
      p.industry ||
      (rawMeta.industry as string) ||
      (rawMeta.original_industry as string) ||
      (p.sectors?.[0] ? normalizeSector(p.sectors[0]) : null);

    const extractedServingSectors =
      p.serving_sectors && p.serving_sectors.length > 0
        ? p.serving_sectors
        : Array.isArray(rawMeta.serving_sectors)
        ? (rawMeta.serving_sectors as string[])
        : [];

    const needsIndustryUpdate = !p.industry && !!extractedIndustry;
    const needsServingUpdate = (!p.serving_sectors || p.serving_sectors.length === 0) && extractedServingSectors.length > 0;

    if (needsIndustryUpdate || needsServingUpdate) {
      backfilledCount++;
      console.log(`[BACKFILL] Proposal ${p.id.slice(-8)} -> industry: "${extractedIndustry}", serving_sectors: [${extractedServingSectors.join(', ')}]`);

      if (!isDryRun) {
        await supabase
          .from('proposals')
          .update({
            industry: extractedIndustry,
            serving_sectors: extractedServingSectors,
          })
          .eq('id', p.id);
      }
    }

    // Prepare ProposalInput for recompute
    const input: ProposalInput = {
      id: p.id,
      mandateId: p.mandate_id || p.id,
      userId: p.user_id,
      intent: p.intent,
      raw_text: p.raw_text || '',
      sector: p.sectors?.[0] ?? null,
      industry: extractedIndustry,
      sub_sector: null,
      serving_sectors: extractedServingSectors,
      geography: p.geographies?.[0] ?? null,
      deal_size: null,
      revenue: null,
      structure: p.deal_structure,
      buyer_type: p.buyer_type ?? (rawMeta.buyer_type as string) ?? null,
      intent_focus: null,
      industry_data: rawMeta,
      special_conditions: p.special_conditions || [],
      deal_size_min: p.deal_size_min_cr?.toString() ?? null,
      deal_size_max: p.deal_size_max_cr?.toString() ?? null,
      revenue_min: p.revenue_min_cr?.toString() ?? null,
      revenue_max: p.revenue_max_cr?.toString() ?? null,
      source: p.source ?? 'WEB',
    };

    if (!isDryRun) {
      // Clear old matches
      await supabase.from('proposal_matches').delete().eq('proposal_id', p.id);

      try {
        const result = await executeMatchmaking(input);
        recomputedCount++;
        console.log(`[RECOMPUTE] Proposal ${p.id.slice(-8)} -> ${result.matchCount} matches (top score: ${result.topScore})`);
      } catch (err) {
        console.error(`❌ Recompute failed for ${p.id.slice(-8)}:`, err);
      }
    } else {
      console.log(`[DRY-RUN] Would recompute matchmaking for ${p.id.slice(-8)} (${p.intent} · ${extractedIndustry || p.sectors?.[0] || 'GENERAL'})`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`[SUMMARY]`);
  console.log(`  Total Proposals Checked: ${proposals.length}`);
  console.log(`  Proposals Backfilled:    ${backfilledCount}`);
  console.log(`  Proposals Recomputed:    ${isDryRun ? '0 (Dry-Run)' : recomputedCount}`);
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error('Fatal error in backfill script:', err);
  process.exit(1);
});
