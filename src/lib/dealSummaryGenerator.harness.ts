/**
 * Harness — dealSummaryGenerator.ts (preview truthfulness)
 * Run: npx tsx src/lib/dealSummaryGenerator.harness.ts   (exit code 1 on any failure)
 */
import { buildEnhancedMandateBrief, generateFullDealSummary } from './dealSummaryGenerator';

let failed = 0;
function check(name: string, ok: boolean, shown = ''): void {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) { failed++; if (shown) console.log(`      got: ${shown.replace(/\s+/g, ' ').slice(0, 220)}`); }
}

// The reported case: the SELL_SIDE flexible-packaging row, and the CDMO buy-side mandate.
const packagingRow = {
    intent: 'SELL_SIDE', industry: 'Flexible Packaging', sector: 'pharma', geography: 'Gujarat',
    revenue_min: 280, revenue_max: 280, structure: 'majority strategic transaction', industry_data: {},
};
const packagingCandidate = {
    intent: 'SELL_SIDE', industry: 'Flexible Packaging', sectors: ['PHARMACEUTICALS'], geographies: ['Gujarat'],
    revenue_min_cr: 280, revenue_max_cr: 280, deal_structure: 'majority strategic transaction', metadata: {},
};
const cdmoBuyer = {
    intent: 'BUY_SIDE', industry: 'Pharmaceutical Contract Manufacturing', sector: 'pharma',
    geography: 'Maharashtra, Gujarat or Telangana', revenue_min: 100, revenue_max: 250,
    structure: 'majority acquisition', industry_data: { business_model: 'contract_manufacturing' },
};

// 1. Stored brief: no longer compares the row with itself
const brief = buildEnhancedMandateBrief(packagingRow);
check('brief: no "aligns strongly"', !/aligns strongly/i.test(brief), brief);
check('brief: no self-comparison (₹280 vs ₹280)', !/satisfying the mandate/i.test(brief), brief);
check('brief: carries no fit section', !/Strategic Fit|Fit Against/.test(brief), brief);
check('brief: SELL_SIDE row described as sell-side, not buy-side', /sell-side/i.test(brief) && !/buy-side/i.test(brief), brief);
check('brief: industry shown without the "broader Pharma sector" wrapper', brief.includes('Flexible Packaging') && !/broader/i.test(brief), brief);

// 2. Viewer-facing summary for the reported pair states the real relations
const s = generateFullDealSummary(cdmoBuyer, packagingCandidate);
check('summary: no "aligns strongly"', !/aligns strongly/i.test(s), s);
check('summary: no "direct sector alignment"', !/direct sector alignment/i.test(s), s);
check('summary: industries shown side by side', s.includes('Flexible Packaging vs your target Pharmaceutical Contract Manufacturing'), s);
check('summary: ₹280 Cr flagged above ₹100–250 Cr', s.includes('₹280 Cr vs your ₹100–250 Cr, above your range'), s);

// 3. Counterparty is never described with the viewer's own data
const bare = generateFullDealSummary(cdmoBuyer, { intent: 'SELL_SIDE' });
const describedPart = bare.split('### Fit Against Your Mandate')[0];
check('no borrowing: buyer industry not used to describe counterparty', !describedPart.includes('Pharmaceutical Contract Manufacturing'), describedPart);
check('no borrowing: no invented "Pan-India" location', !bare.includes('Pan-India'), bare);
check('no borrowing: no invented deal structure', !/100% buyout|majority/i.test(describedPart), describedPart);
check('no borrowing: buyer contract-manufacturing flag not attributed', !/contract manufacturing/i.test(describedPart), describedPart);
check('missing fields reported as not disclosed', /Location: not disclosed/.test(bare) && /Revenue: not disclosed/.test(bare), bare);

// 4. Ranges checked against both ends
const rev = (min: number, max: number) =>
    generateFullDealSummary(cdmoBuyer, { ...packagingCandidate, revenue_min_cr: min, revenue_max_cr: max });
check('revenue within range', rev(150, 150).includes('within your range'));
check('revenue below range', rev(60, 60).includes('below your range'));
check('revenue partly overlapping', rev(200, 300).includes('partly overlaps your range'));
check('revenue range covering the target band', rev(50, 400).includes('covers your range'));

// 5. Missing intent is not guessed (it used to be inverted from the viewer's intent)
check('missing intent not guessed', !/sell-side|buy-side/i.test(generateFullDealSummary(cdmoBuyer, { industry: 'Flexible Packaging' })));

// 6. Buy-side brief labels its figures as the target's, not its own
check('buy-side brief: revenue labelled as target', /Target revenue: ₹100–250 Cr/.test(buildEnhancedMandateBrief(cdmoBuyer)), buildEnhancedMandateBrief(cdmoBuyer));

// 7. Engine's narrow rating is surfaced, not hidden
check('narrow industry rating surfaced', /rated industry fit as narrow/.test(
    generateFullDealSummary(cdmoBuyer, packagingCandidate, { industryCompatibility: 'NARROW' })));

// 8. Existing privacy layer still applied
check('phone numbers still redacted', !generateFullDealSummary(cdmoBuyer,
    { ...packagingCandidate, metadata: { certifications: 'WHO-GMP, call 9819202205' } }).includes('9819202205'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);