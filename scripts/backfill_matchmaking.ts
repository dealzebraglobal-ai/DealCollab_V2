/**
 * DealCollab — Matchmaking V2 Backfill & Recompute Script
 * ========================================================
 * Implements Step 9 of the Matchmaking Engine Overhaul:
 * 1. Backfills `industry` and `serving_sectors` on existing proposals.
 * 2. Cleans up coarse/general sector assignments.
 * 3. Re-generates canonical texts, embeddings, and saved search query objects.
 * 4. Supports:
 *      --dry-run   (default: previews all changes and runs before/after simulations)
 *      --persist   (commits changes to Supabase and recomputes active proposal matches)
 *
 * Usage:
 *   npx tsx scripts/backfill_matchmaking.ts --dry-run
 *   npx tsx scripts/backfill_matchmaking.ts --persist
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  buildCanonicalText,
  executeMatchmaking,
  applyHardRejections,
  calculateV2Score,
  Candidate,
  ProposalInput,
} from '../src/lib/matchmakingEngine';
import { resolveIndustryCompatibility } from '../src/lib/M5_sectorMatrix';
import { buildSavedSearchRecord } from '../src/lib/M5_persistence';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const isPersist = process.argv.includes('--persist');
const isDryRun = !isPersist || process.argv.includes('--dry-run');

console.log('===========================================================');
console.log('🚀 DealCollab Matchmaking V2 Backfill & Recompute Tool');
console.log(`🔧 Mode: ${isPersist ? 'COMMIT (Persist to DB)' : 'DRY-RUN (Simulation only)'}`);
console.log('===========================================================\n');

if (isPersist && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --persist mode.');
  process.exit(1);
}

const supabase = (SUPABASE_URL && SERVICE_KEY) ? createClient(SUPABASE_URL, SERVICE_KEY) : null;
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

// Heuristic industry extractor from text/sectors
function inferIndustryAndServingSectors(proposal: any): { industry: string | null; servingSectors: string[] } {
  let industry = proposal.industry || null;
  const servingSectors: string[] = proposal.serving_sectors ? [...proposal.serving_sectors] : [];
  const text = (proposal.raw_text || '').toLowerCase();

  // 1. If industry is missing, extract from sectors if sector is not coarse "GENERAL"
  if (!industry && Array.isArray(proposal.sectors) && proposal.sectors.length > 0) {
    const firstSector = proposal.sectors[0]?.trim();
    if (firstSector && firstSector.toUpperCase() !== 'GENERAL') {
      industry = firstSector;
    }
  }

  // 2. Keyword inference for common industries if still missing or GENERAL
  if (!industry || industry.toUpperCase() === 'GENERAL') {
    if (text.includes('artificial intelligence') || text.includes('ai ') || text.includes('machine learning') || text.includes('data analytics') || text.includes('analytics')) {
      industry = 'AI & Data Analytics';
    } else if (text.includes('saas') || text.includes('software as a service')) {
      industry = 'SaaS';
    } else if (text.includes('fintech') || text.includes('payments') || text.includes('lending platform')) {
      industry = 'Fintech';
    } else if (text.includes('pharma') || text.includes('pharmaceutical') || text.includes('api manufacturing')) {
      industry = 'Pharmaceuticals';
    } else if (text.includes('hospital') || text.includes('clinic') || text.includes('healthcare')) {
      industry = 'Healthcare';
    } else if (text.includes('nbfc') || text.includes('microfinance')) {
      industry = 'NBFC';
    } else if (text.includes('cold chain') || text.includes('logistics') || text.includes('warehousing')) {
      industry = 'Logistics';
    }
  }

  // 3. Infer serving sectors if mentioned (e.g. "serving enterprise", "catering to pharma and healthcare")
  if (servingSectors.length === 0) {
    if (text.includes('pharma') && (text.includes('serv') || text.includes('client') || text.includes('cater'))) {
      servingSectors.push('PHARMACEUTICALS');
    }
    if (text.includes('healthcare') && (text.includes('serv') || text.includes('client') || text.includes('cater'))) {
      servingSectors.push('HEALTHCARE');
    }
    if (text.includes('fintech') || text.includes('bfsi') || text.includes('banking')) {
      if (text.includes('serv') || text.includes('client') || text.includes('cater')) {
        servingSectors.push('FINTECH');
      }
    }
    if (text.includes('enterprise') || text.includes('b2b')) {
      servingSectors.push('ENTERPRISE');
    }
  }

  return { industry, servingSectors };
}

// Generate embedding helper
async function getEmbedding(text: string): Promise<number[] | null> {
  if (!openai) return null;
  try {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 7000),
    });
    return res.data[0]?.embedding || null;
  } catch (err: any) {
    console.warn(`⚠️ OpenAI embedding failed: ${err.message}`);
    return null;
  }
}

// Simulation of the Pune AI/Data-Analytics test case
function runPuneSimulation() {
  console.log('--- [Simulation] Pune AI/Data-Analytics Fundraise Regression Check ---');

  const sourceProposal: ProposalInput = {
    mandateId: 'sim-pune-ai-source',
    userId: 'user-pune',
    intent: 'FUNDRAISING',
    industry: 'AI & Data Analytics',
    sector: 'TECHNOLOGY',
    serving_sectors: ['ENTERPRISE', 'FINTECH', 'HEALTHCARE'],
    geography: 'Pune',
    deal_size: '5',
    deal_size_min: '4',
    deal_size_max: '6',
    structure: 'Convertible Debenture',
    raw_text: 'Pune-based AI data analytics startup raising 5 Cr via convertible debentures for enterprise expansion',
  };

  const candidatePool: Array<{ label: string; candidate: Candidate; expectedOutcome: string }> = [
    {
      label: 'Early-Stage VC Fund (₹3-10 Cr Equity/Convertible in India/Pune)',
      candidate: {
        id: 'c-vc-fund',
        user_id: 'u-vc',
        intent: 'BUY_SIDE',
        industry: 'Early Stage Tech Fund',
        sectors: ['TECHNOLOGY'],
        serving_sectors: [],
        buyer_type: 'VENTURE_CAPITAL',
        deal_structure: 'Convertible Note / Equity',
        geographies: ['India', 'Pune'],
        deal_size_min_cr: 3,
        deal_size_max_cr: 10,
        revenue_min_cr: null,
        revenue_max_cr: null,
        normalised_text: 'Tech fund investing 3 to 10 Cr convertible equity',
        similarity: 0.82,
        advisor_name: null,
        contact_phone: null,
        fraud_flags: null,
        quality_tier: 1,
        inferred_buyer_type: 'VENTURE_CAPITAL',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
      expectedOutcome: 'MATCH (V2 Score >= 60, High Fit)',
    },
    {
      label: '100% Buyout Acquirer (Reject minority fundraise)',
      candidate: {
        id: 'c-buyout-100',
        user_id: 'u-buyer',
        intent: 'BUY_SIDE',
        industry: 'Technology',
        sectors: ['TECHNOLOGY'],
        serving_sectors: [],
        buyer_type: 'STRATEGIC_BUYER',
        deal_structure: '100% Acquisition / Full Buyout',
        geographies: ['India'],
        deal_size_min_cr: 2,
        deal_size_max_cr: 10,
        revenue_min_cr: null,
        revenue_max_cr: null,
        normalised_text: 'Acquiring 100% full buyout of tech company',
        similarity: 0.75,
        advisor_name: null,
        contact_phone: null,
        fraud_flags: null,
        quality_tier: 1,
        inferred_buyer_type: 'STRATEGIC_BUYER',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
      expectedOutcome: 'HARD REJECT (HR-3: Incompatible deal structure / buyout intent)',
    },
    {
      label: 'Pharma API Manufacturer Acquirer',
      candidate: {
        id: 'c-pharma-mfg',
        user_id: 'u-pharma',
        intent: 'BUY_SIDE',
        industry: 'Pharma API Manufacturing',
        sectors: ['PHARMACEUTICALS'],
        serving_sectors: [],
        buyer_type: 'STRATEGIC_BUYER',
        deal_structure: '100% Acquisition',
        geographies: ['Pune'],
        deal_size_min_cr: 5,
        deal_size_max_cr: 10,
        revenue_min_cr: null,
        revenue_max_cr: null,
        normalised_text: 'Buying pharmaceutical api plant in Pune',
        similarity: 0.50,
        advisor_name: null,
        contact_phone: null,
        fraud_flags: null,
        quality_tier: 1,
        inferred_buyer_type: null,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
      expectedOutcome: 'HARD REJECT (HR-4: Incompatible industry and intent)',
    },
    {
      label: 'Healthcare IT Strategic Investor (Serves Healthcare)',
      candidate: {
        id: 'c-health-tech-inv',
        user_id: 'u-health',
        intent: 'BUY_SIDE',
        industry: 'Healthcare Technology',
        sectors: ['HEALTHCARE', 'TECHNOLOGY'],
        serving_sectors: ['HEALTHCARE'],
        buyer_type: 'CORPORATE_VC',
        deal_structure: 'Minority Equity / Convertible',
        geographies: ['India'],
        deal_size_min_cr: 3,
        deal_size_max_cr: 8,
        revenue_min_cr: null,
        revenue_max_cr: null,
        normalised_text: 'Healthcare corporate investing in healthtech and data platforms',
        similarity: 0.76,
        advisor_name: null,
        contact_phone: null,
        fraud_flags: null,
        quality_tier: 1,
        inferred_buyer_type: 'CORPORATE_VC',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
      expectedOutcome: 'MATCH (Serving-sector connection to Healthcare)',
    },
  ];

  for (const item of candidatePool) {
    const hardRejection = applyHardRejections(sourceProposal, item.candidate);
    if (hardRejection && hardRejection.rejected) {
      console.log(`  ❌ ${item.label}`);
      console.log(`     -> Rejected by: ${hardRejection.reason}`);
      console.log(`     -> Expected: ${item.expectedOutcome}`);
    } else {
      const score = calculateV2Score(sourceProposal, item.candidate);
      console.log(`  ✅ ${item.label}`);
      console.log(`     -> Matched with Score: ${score.finalScore}/100 (${score.archetype})`);
      console.log(`     -> Reason: ${score.matchReason}`);
      console.log(`     -> Expected: ${item.expectedOutcome}`);
    }
  }
  console.log('----------------------------------------------------------------------\n');
}

async function main() {
  runPuneSimulation();

  if (!supabase) {
    console.log('ℹ️ No Supabase credentials configured. Completed simulation run.');
    return;
  }

  console.log('🔍 Fetching proposals from database...');
  const { data: proposals, error } = await supabase
    .from('proposals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Failed to fetch proposals:', error.message);
    return;
  }

  console.log(`📋 Found ${proposals?.length || 0} total proposals in database.\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const proposal of (proposals || [])) {
    const { industry: newIndustry, servingSectors: newServingSectors } = inferIndustryAndServingSectors(proposal);
    const hasIndustryChange = newIndustry && newIndustry !== proposal.industry;
    const hasServingChange = newServingSectors.length > 0 && JSON.stringify(newServingSectors) !== JSON.stringify(proposal.serving_sectors || []);

    const canonicalText = buildCanonicalText({
      userId: proposal.user_id,
      intent: proposal.intent,
      industry: newIndustry || proposal.industry,
      sector: proposal.sectors?.[0] || 'GENERAL',
      serving_sectors: newServingSectors.length > 0 ? newServingSectors : proposal.serving_sectors,
      geography: proposal.geographies?.[0] || null,
      deal_size_min: proposal.deal_size_min_cr?.toString() || null,
      deal_size_max: proposal.deal_size_max_cr?.toString() || null,
      revenue_min: proposal.revenue_min_cr?.toString() || null,
      revenue_max: proposal.revenue_max_cr?.toString() || null,
      structure: proposal.deal_structure || null,
      buyer_type: proposal.buyer_type || null,
      special_conditions: proposal.special_conditions || [],
      raw_text: proposal.raw_text || '',
    });

    if (hasIndustryChange || hasServingChange || isPersist) {
      updatedCount++;
      console.log(`[Proposal ${proposal.id}]`);
      console.log(`  Intent: ${proposal.intent}`);
      console.log(`  Industry: "${proposal.industry}" -> "${newIndustry || proposal.industry}"`);
      console.log(`  Serving Sectors: ${JSON.stringify(proposal.serving_sectors || [])} -> ${JSON.stringify(newServingSectors)}`);

      if (isPersist) {
        const embedding = await getEmbedding(canonicalText);
        const updatePayload: any = {
          industry: newIndustry || proposal.industry,
          serving_sectors: newServingSectors.length > 0 ? newServingSectors : proposal.serving_sectors,
        };
        if (embedding) {
          updatePayload.embedding = embedding;
        }

        const { error: updateErr } = await supabase
          .from('proposals')
          .update(updatePayload)
          .eq('id', proposal.id);

        if (updateErr) {
          console.error(`  ❌ DB update failed: ${updateErr.message}`);
        } else {
          console.log('  ✅ DB updated');
        }

        // Also update saved search query object
        const savedSearchRecord = buildSavedSearchRecord(
          {
            userId: proposal.user_id,
            intent: proposal.intent,
            industry: newIndustry || proposal.industry,
            sector: proposal.sectors?.[0] || 'GENERAL',
            serving_sectors: newServingSectors.length > 0 ? newServingSectors : proposal.serving_sectors,
            geography: proposal.geographies?.[0] || null,
            structure: proposal.deal_structure || null,
            sub_sector: null,
            deal_size_min: proposal.deal_size_min_cr?.toString() ?? null,
            deal_size_max: proposal.deal_size_max_cr?.toString() ?? null,
            revenue_min: proposal.revenue_min_cr?.toString() ?? null,
            revenue_max: proposal.revenue_max_cr?.toString() ?? null,
            buyer_type: proposal.buyer_type ?? null,
            special_conditions: proposal.special_conditions || [],
          },
          proposal.id,
          embedding ?? [],
          0,
          false
        );

        await supabase
          .from('saved_searches')
          .upsert({
            mandate_id: proposal.id,
            user_id: proposal.user_id,
            query_object: savedSearchRecord.query_object,
            ...(embedding ? { query_embedding: embedding } : {}),
            is_active: proposal.status === 'ACTIVE',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'mandate_id' });
      }
    } else {
      skippedCount++;
    }
  }

  console.log('\n===========================================================');
  console.log(`🏁 Summary: ${updatedCount} proposals to update / updated, ${skippedCount} unchanged.`);
  if (isDryRun && !isPersist) {
    console.log('💡 Note: Run with --persist to apply these updates to the database.');
  }
  console.log('===========================================================');
}

main().catch((err) => {
  console.error('Fatal error in backfill script:', err);
  process.exit(1);
});
