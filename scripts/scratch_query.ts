import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env files
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

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // 1. Fetch proposals in chunks of 1000
  let allProposals: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('proposals')
      .select('id, source, status, user_id, sectors, metadata')
      .range(from, from + step - 1);
    if (error) {
      console.error('Error fetching proposals:', error);
      break;
    }
    allProposals.push(...data);
    if (data.length < step) break;
    from += step;
  }
  console.log('Total proposals loaded:', allProposals.length);

  // Group by source, status, seeded (user_id IS NULL)
  const group1: Record<string, { source: string, status: string, seeded: boolean, count: number }> = {};
  for (const p of allProposals) {
    const src = p.source ?? 'NULL';
    const st = p.status ?? 'NULL';
    const seeded = p.user_id === null;
    const key = `${src}|${st}|${seeded}`;
    if (!group1[key]) {
      group1[key] = { source: src, status: st, seeded, count: 0 };
    }
    group1[key].count++;
  }
  const rows1 = Object.values(group1).sort((a, b) => b.count - a.count);
  console.log('\n=== QUERY 1.1 OUTPUT ===');
  console.table(rows1);

  // Group by sector for active proposals
  const sectorGroup: Record<string, number> = {};
  let activeCount = 0;
  let hasIndustryCount = 0;
  for (const p of allProposals) {
    if (p.status === 'ACTIVE') {
      activeCount++;
      const s = p.sectors && p.sectors.length > 0 ? p.sectors[0] : null;
      const sKey = s ?? '[NULL]';
      sectorGroup[sKey] = (sectorGroup[sKey] || 0) + 1;
      if (p.metadata && typeof p.metadata === 'object' && ('industry' in p.metadata || 'Industry' in p.metadata)) {
        hasIndustryCount++;
      }
    }
  }
  const sectorRows = Object.entries(sectorGroup)
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  console.log('\n=== QUERY 1.2 OUTPUT ===');
  console.table(sectorRows);

  console.log('\n=== QUERY 3 OUTPUT ===');
  console.table([{ has_industry: hasIndustryCount, count: activeCount }]);

  // Check proposal_matches
  let allMatches: any[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('proposal_matches')
      .select('id, proposal_id, matched_proposal_id, final_score, match_archetype, match_reason')
      .range(from, from + step - 1);
    if (error) {
      console.error('Error fetching matches:', error);
      break;
    }
    allMatches.push(...data);
    if (data.length < step) break;
    from += step;
  }
  console.log('\nTotal proposal_matches rows:', allMatches.length);

  // Check reciprocal partners in proposal_matches
  const pairSet = new Set(allMatches.map(m => `${m.proposal_id}->${m.matched_proposal_id}`));
  let reciprocalCount = 0;
  for (const m of allMatches) {
    if (pairSet.has(`${m.matched_proposal_id}->${m.proposal_id}`)) {
      reciprocalCount++;
    }
  }
  console.log(`Reciprocal pairs count: ${reciprocalCount} / ${allMatches.length} (${reciprocalCount / 2} mutual pairs)`);

  // Score distribution sample
  const sampleDecimal = allMatches.filter(m => Number(m.final_score) <= 1 && Number(m.final_score) > 0);
  const sample100 = allMatches.filter(m => Number(m.final_score) > 1);
  console.log(`Scores <= 1 (decimal scale): ${sampleDecimal.length}`);
  console.log(`Scores > 1 (0-100 scale): ${sample100.length}`);

  // Archetype distribution
  const archetypeCounts: Record<string, number> = {};
  allMatches.forEach(m => {
    const arch = m.match_archetype || '[NULL]';
    archetypeCounts[arch] = (archetypeCounts[arch] || 0) + 1;
  });
  console.log('\nMatch Archetypes:');
  console.table(archetypeCounts);
}

run().catch(console.error);
