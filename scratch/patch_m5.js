const fs = require('fs');

let content = fs.readFileSync('src/lib/M5_sectorMatrix.ts', 'utf8');

// Replace CompatibilityLevel definition
content = content.replace(
  /export type CompatibilityLevel = 'COMPATIBLE' \| 'NARROW' \| 'INCOMPATIBLE';/,
  `export type CompatibilityLevel = 
  | 'DIRECT_MATCH' 
  | 'STRONG_ADJACENT' 
  | 'CAPABILITY_MATCH' 
  | 'SERVING_SECTOR_MATCH' 
  | 'COARSE_SECTOR_MATCH' 
  | 'GENERAL_FALLBACK' 
  | 'INCOMPATIBLE';`
);

// Replace INDUSTRY_COMPATIBILITY_RULES signature
content = content.replace(
  /const INDUSTRY_COMPATIBILITY_RULES: Record<string, 'EXACT' \| 'COMPATIBLE' \| 'NARROW' \| 'INCOMPATIBLE'> = \{/,
  'const INDUSTRY_COMPATIBILITY_RULES: Record<string, CompatibilityLevel> = {'
);

// Update INDUSTRY_COMPATIBILITY_RULES block
let beforeRules = content.substring(0, content.indexOf('const INDUSTRY_COMPATIBILITY_RULES'));
let rulesStart = content.indexOf('{', content.indexOf('const INDUSTRY_COMPATIBILITY_RULES'));
let rulesEnd = content.indexOf('};', rulesStart) + 2;
let rulesBlock = content.substring(rulesStart, rulesEnd);
let afterRules = content.substring(rulesEnd);

rulesBlock = rulesBlock.replace(/'EXACT'/g, "'DIRECT_MATCH'");

// Mapping specific relationships
rulesBlock = rulesBlock.replace(/'PACKAGING\|PHARMACEUTICALS': 'COMPATIBLE'/g, "'PACKAGING|PHARMACEUTICALS': 'SERVING_SECTOR_MATCH'");
rulesBlock = rulesBlock.replace(/'PACKAGING\|CONSUMER': 'COMPATIBLE'/g, "'PACKAGING|CONSUMER': 'SERVING_SECTOR_MATCH'");
rulesBlock = rulesBlock.replace(/'PACKAGING\|FMCG': 'COMPATIBLE'/g, "'PACKAGING|FMCG': 'SERVING_SECTOR_MATCH'");
rulesBlock = rulesBlock.replace(/'PACKAGING\|FOOD': 'COMPATIBLE'/g, "'PACKAGING|FOOD': 'SERVING_SECTOR_MATCH'");

// Everything else that is 'COMPATIBLE' in INDUSTRY_COMPATIBILITY_RULES becomes 'STRONG_ADJACENT'
// except 'INCOMPATIBLE' which stays the same.
rulesBlock = rulesBlock.replace(/: 'COMPATIBLE'/g, ": 'STRONG_ADJACENT'");

// NARROW -> GENERAL_FALLBACK ? No, NARROW can be CAPABILITY_MATCH or COARSE. We will just use 'COARSE_SECTOR_MATCH' for NARROW in rules.
rulesBlock = rulesBlock.replace(/: 'NARROW'/g, ": 'COARSE_SECTOR_MATCH'");

content = beforeRules + 'const INDUSTRY_COMPATIBILITY_RULES: Record<string, CompatibilityLevel> = ' + rulesBlock + afterRules;

// Now getSectorCompatibility
// Same sector -> COARSE_SECTOR_MATCH (since it's a broad sector match)
content = content.replace(
  /level:\s*'COMPATIBLE',\s*penalty:\s*0,\s*reason:\s*`\$\{s\}: Same-sector consolidation/g,
  "level:   'COARSE_SECTOR_MATCH',\n      penalty: 0.10,\n      reason:  `${s}: Same-sector consolidation"
);

// getSectorCompatibility return COMPATIBLE -> COARSE_SECTOR_MATCH
content = content.replace(
  /return \{ level: 'COMPATIBLE', penalty: 0, reason: compatReason \};/g,
  "return { level: 'COARSE_SECTOR_MATCH', penalty: 0.10, reason: compatReason };"
);

// getSectorCompatibility return NARROW -> GENERAL_FALLBACK
content = content.replace(
  /return \{ level: 'NARROW', penalty: 0.10, reason: narrowReason \};/g,
  "return { level: 'GENERAL_FALLBACK', penalty: 0.20, reason: narrowReason };"
);

content = content.replace(
  /level:\s*'NARROW',\s*penalty:\s*0.15,\s*reason:\s*`\$\{s\} → \$\{t\}: No direct deal/g,
  "level:   'GENERAL_FALLBACK',\n    penalty: 0.25,\n    reason:  `${s} → ${t}: No direct deal"
);


// In getIndustryCompatibility
// 1. Check cross-sector capability
content = content.replace(
  /level: 'COMPATIBLE',\s*penalty: 0,\s*reason: `Cross-sector capability:/g,
  "level: 'SERVING_SECTOR_MATCH',\n      penalty: 0,\n      reason: `Cross-sector capability:"
);

// 2. Exact match on raw specific industry
content = content.replace(
  /level: 'COMPATIBLE',\s*penalty: 0,\s*reason: `Exact industry alignment:/g,
  "level: 'DIRECT_MATCH',\n      penalty: 0,\n      reason: `Exact industry alignment:"
);

// 3. Normalized specific industry checks
content = content.replace(
  /level: 'COMPATIBLE',\s*penalty: 0,\s*reason: `Exact category match:/g,
  "level: 'DIRECT_MATCH',\n      penalty: 0,\n      reason: `Exact category match:"
);

// Rule == 'EXACT' || rule == 'COMPATIBLE' logic
// wait, the rule now returns 'DIRECT_MATCH', 'STRONG_ADJACENT', etc.
// Let's rewrite this block.
let getIndStart = content.indexOf('if (sNorm && cNorm) {');
let getIndEnd = content.indexOf('// 4. Fallback to Coarse Sector');
let getIndBlock = content.substring(getIndStart, getIndEnd);

let newGetIndBlock = `if (sNorm && cNorm) {
    const pairKey = \`\${sNorm}|\${cNorm}\`;
    const reverseKey = \`\${cNorm}|\${sNorm}\`;
    const rule = INDUSTRY_COMPATIBILITY_RULES[pairKey] || INDUSTRY_COMPATIBILITY_RULES[reverseKey];

    if (rule === 'INCOMPATIBLE') {
      return {
        level: 'INCOMPATIBLE',
        penalty: 1.0,
        reason: \`Industry mismatch: \${sourceIndustry || sNorm} is incompatible with \${candidateIndustry || cNorm}.\`,
      };
    }
    if (rule) {
      return {
        level: rule,
        penalty: 0,
        reason: \`Aligned industry sector: \${sourceIndustry || sNorm} aligns with \${candidateIndustry || cNorm}.\`,
      };
    }
  }

  `;
content = content.substring(0, getIndStart) + newGetIndBlock + content.substring(getIndEnd);


// resolveIndustryCompatibility
let resStart = content.indexOf('export function resolveIndustryCompatibility');
let resEnd = content.indexOf('// ─────────────────────────────────────────────────────────────', resStart);

let newResBlock = `export function resolveIndustryCompatibility(
  source: IndustryCompatibilityInput,
  candidate: IndustryCompatibilityInput,
): IndustryCompatibilityResult {
  const comp = getIndustryCompatibility(
    source.industry,
    candidate.industry,
    source.sector ?? source.sectors?.[0] ?? null,
    candidate.sector ?? candidate.sectors?.[0] ?? null,
    source.serving_sectors,
    candidate.serving_sectors,
  );

  let isGeneralFallback = false;
  if (comp.level === 'GENERAL_FALLBACK' || comp.level === 'COARSE_SECTOR_MATCH') {
    const sInd = (source.industry ?? '').trim().toLowerCase();
    const cInd = (candidate.industry ?? '').trim().toLowerCase();
    const statedIndustriesDiffer = sInd.length > 0 && cInd.length > 0 && sInd !== cInd;
    if (statedIndustriesDiffer) {
        isGeneralFallback = true;
    }
  }

  let score: number;
  switch (comp.level) {
    case 'DIRECT_MATCH': score = 1.0; break;
    case 'STRONG_ADJACENT': score = 0.8; break;
    case 'CAPABILITY_MATCH': score = 0.6; break;
    case 'SERVING_SECTOR_MATCH': score = 0.5; break;
    case 'COARSE_SECTOR_MATCH': score = 0.4; break;
    case 'GENERAL_FALLBACK': score = 0.2; break;
    case 'INCOMPATIBLE':
    default:
      score = 0; break;
  }

  let archetype: string = MATCH_ARCHETYPES.CROSS_SECTOR;
  if (comp.level === 'DIRECT_MATCH') {
    archetype = MATCH_ARCHETYPES.BOLT_ON;
  } else if (/licen[cs]e/i.test(comp.reason)) {
    archetype = MATCH_ARCHETYPES.LICENSE;
  } else if (comp.reason.includes('Vertical') || comp.reason.includes('backward integration') || comp.reason.includes('integration')) {
    archetype = MATCH_ARCHETYPES.VERTICAL;
  } else if (/software|tech|digital/i.test(comp.reason)) {
    archetype = MATCH_ARCHETYPES.TECH_ENABLER;
  } else if (comp.level === 'SERVING_SECTOR_MATCH' || comp.level === 'CAPABILITY_MATCH') {
    archetype = MATCH_ARCHETYPES.CROSS_SECTOR;
  }

  return { ...comp, score, archetype, isGeneralFallback };
}
`;

content = content.substring(0, resStart) + newResBlock + content.substring(resEnd);

fs.writeFileSync('src/lib/M5_sectorMatrix.ts', content);
