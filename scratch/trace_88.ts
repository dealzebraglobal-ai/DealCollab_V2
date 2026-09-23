import { resolveIndustryCompatibility } from '../src/lib/M5_sectorMatrix';
import { calculateV2Score, type ProposalInput, type Candidate } from '../src/lib/matchmakingEngine';

const source: ProposalInput = {
    userId: 'user1',
    intent: 'BUY_SIDE',
    industry: 'Pharmaceutical contract manufacturing',
    sector: 'MANUFACTURING',
    geography: 'Maharashtra, Gujarat, Telangana',
    deal_structure: 'Majority / Control Acquisition',
    revenue_min_cr: 100,
    revenue_max_cr: 250,
    raw_text: '',
};

const candidate: Candidate = {
    id: 'cand1',
    user_id: 'user2',
    intent: 'SELL_SIDE',
    industry: 'Flexible Packaging',
    sectors: ['MANUFACTURING'],
    serving_sectors: ['Pharmaceuticals'],
    geographies: ['Gujarat'],
    deal_structure: 'Majority Stake',
    revenue_min_cr: 280,
    revenue_max_cr: 280,
    deal_size_min_cr: null,
    deal_size_max_cr: null,
    similarity: 0.95, // Simulate very high semantic similarity
    normalised_text: '',
    raw_text: '',
    fraud_flags: [],
    quality_tier: 1,
    is_shell: false,
    buyer_type: null,
    inferred_buyer_type: null,
    advisor_name: null,
    contact_phone: null,
    created_at: new Date().toISOString(),
};

const score = calculateV2Score(source, candidate);

const comp = resolveIndustryCompatibility(
    {
      industry: source.industry,
      sector: source.sector,
      sectors: source.sector ? [source.sector] : [],
      serving_sectors: source.serving_sectors,
    },
    {
      industry: candidate.industry,
      sector: candidate.sectors?.[0] ?? null,
      sectors: candidate.sectors,
      serving_sectors: candidate.serving_sectors,
    }
);

console.log('--- TRACE ---');
console.log('OLD SCORE WAS: 88%');
console.log('NEW FINAL SCORE:', score.finalScore);
console.log('NEW INDUSTRY RELATIONSHIP:', comp.level);
console.log('NEW INDUSTRY SCORE (0-1):', comp.score);
console.log('NEW ARCHETYPE:', score.archetype);
console.log('NEW MATCH REASON:', score.matchReason);
console.log('SEMANTIC SCORE USED (out of 1):', score.breakdown.semanticScore);
console.log('-------------');

