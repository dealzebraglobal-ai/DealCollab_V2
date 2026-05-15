// scripts/enrich-proposals.ts
// Run: npx tsx scripts/enrich-proposals.ts
//
// Extracts missing fields from raw_text using the project's own detectors,
// then re-computes quality_score and quality_tier.
//
// This fixes the 1,340+ proposals that have NULL sectors from the CSV import.
import fs from 'fs';
import path from 'path';

// Load env manually (checks .env.local first, then .env)
const envFiles = ['.env.local', '.env'];
for (const e of envFiles) {
    const ep = path.resolve(process.cwd(), e);
    if (fs.existsSync(ep)) {
        const envFile = fs.readFileSync(ep, 'utf8');
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
import {
    computeQualityScore,
    fixEncoding,
    normalizeIntent,
    normalizeSize,
    qualityTierFromScore,
} from '../src/lib/dataQuality';
import {
    detectIntentFromText,
    detectSectorFromText,
    detectStructureFromText,
} from '../src/lib/promptRouter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const PAGE = 100;

// Geography keywords for crude detection
const GEO_KEYWORDS: Record<string, string> = {
    mumbai: 'mumbai', pune: 'pune', thane: 'mumbai', nashik: 'maharashtra',
    ahmedabad: 'gujarat', surat: 'gujarat', baroda: 'gujarat', vadodara: 'gujarat',
    delhi: 'delhi-ncr', noida: 'delhi-ncr', gurgaon: 'delhi-ncr', gurugram: 'delhi-ncr',
    bangalore: 'bangalore', bengaluru: 'bangalore', mysore: 'karnataka',
    chennai: 'chennai', coimbatore: 'tamil-nadu', madurai: 'tamil-nadu',
    hyderabad: 'hyderabad', telangana: 'hyderabad',
    kolkata: 'kolkata', 'west bengal': 'kolkata',
    jaipur: 'rajasthan', jodhpur: 'rajasthan',
    'pan india': 'pan-india', 'all india': 'pan-india',
};

function detectGeographyFromText(text: string): string | null {
    const t = text.toLowerCase();
    for (const [k, v] of Object.entries(GEO_KEYWORDS)) {
        if (t.includes(k)) return v;
    }
    return null;
}

interface Row {
    id: string;
    raw_text: string | null;
    normalised_text: string | null;
    intent: string | null;
    sectors: string[] | null;
    geographies: string[] | null;
    deal_size_min_cr: string | null;
    deal_size_max_cr: string | null;
    revenue_min_cr: string | null;
    deal_structure: string | null;
    quality_tier: string | null;
}

async function main() {
    console.log('🔧 ENRICHING PROPOSALS\n══════════════════════════');

    let offset = 0;
    let totalEnriched = 0;
    let totalSectorAdded = 0;
    let totalIntentFixed = 0;
    let totalGeoAdded = 0;
    let totalStructureAdded = 0;
    let totalTierChanged = 0;

    while (true) {
        const { data: rows, error } = await supabase
            .from('proposals')
            .select('id, raw_text, normalised_text, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, revenue_min_cr, deal_structure, quality_tier')
            .range(offset, offset + PAGE - 1)
            .order('created_at', { ascending: true });

        if (error) { console.error(error); break; }
        if (!rows || rows.length === 0) break;

        for (const r of rows as Row[]) {
            const text = fixEncoding(r.raw_text || r.normalised_text || '');
            if (text.length < 5) continue;

            const updates: Record<string, unknown> = {};

            // 1. Sector extraction if missing
            const hasSector = r.sectors && r.sectors.length > 0 && r.sectors[0] && r.sectors[0].trim() !== '';
            if (!hasSector) {
                const detected = detectSectorFromText(text);
                if (detected) {
                    updates.sectors = [detected];
                    totalSectorAdded++;
                }
            } else {
                // Lowercase normalize existing sectors so the matrix can find them
                const lower = (r.sectors || []).map(s => s.toLowerCase());
                if (lower.join('|') !== (r.sectors || []).join('|')) {
                    updates.sectors = lower;
                }
            }

            // 2. Intent canonicalize if needed
            const canonicalIntent = normalizeIntent(r.intent);
            if (canonicalIntent && canonicalIntent !== r.intent) {
                updates.intent = canonicalIntent;
                totalIntentFixed++;
            } else if (!r.intent) {
                const detected = detectIntentFromText(text);
                if (detected) {
                    updates.intent = detected;
                    totalIntentFixed++;
                }
            }

            // 3. Geography if missing
            const hasGeo = r.geographies && r.geographies.length > 0 && r.geographies[0];
            if (!hasGeo) {
                const detected = detectGeographyFromText(text);
                if (detected) {
                    updates.geographies = [detected];
                    totalGeoAdded++;
                }
            }

            // 4. Structure if missing
            if (!r.deal_structure) {
                const detected = detectStructureFromText(text);
                if (detected) {
                    updates.deal_structure = detected;
                    totalStructureAdded++;
                }
            }

            // 5. Size from raw text if missing
            if (!r.deal_size_min_cr) {
                const n = normalizeSize(text);
                if (n?.min_cr != null) {
                    updates.deal_size_min_cr = String(n.min_cr);
                    updates.deal_size_max_cr = String(n.max_cr ?? n.min_cr);
                }
            }

            // 6. Re-compute quality with enriched fields
            const finalSectors = (updates.sectors as string[]) || r.sectors;
            const finalIntent = (updates.intent as string) || r.intent;
            const finalGeo = (updates.geographies as string[]) || r.geographies;
            const finalStructure = (updates.deal_structure as string) || r.deal_structure;
            const finalSizeMin = (updates.deal_size_min_cr as string) || r.deal_size_min_cr;

            const score = computeQualityScore({
                rawText: text,
                intent: finalIntent,
                sector: finalSectors?.[0] ?? null,
                geography: finalGeo?.[0] ?? null,
                deal_size_min_cr: finalSizeMin ? parseFloat(finalSizeMin) : null,
                revenue_min_cr: r.revenue_min_cr ? parseFloat(r.revenue_min_cr) : null,
                structure: finalStructure,
            });
            const newTier = qualityTierFromScore(score);
            const oldTier = r.quality_tier ? parseInt(r.quality_tier) : 4;

            if (newTier !== oldTier) {
                updates.quality_score = score;
                updates.quality_tier = newTier.toString();
                // If was T4 (SKIPPED for embedding) and now T1-3, reset to PENDING so it gets embedded
                if (oldTier === 4 && newTier < 4) {
                    updates.embedding_status = 'PENDING';
                    updates.status = 'ACTIVE';
                }
                totalTierChanged++;
            }

            // Normalize text
            if (text !== r.raw_text) {
                updates.normalised_text = text;
            }

            if (Object.keys(updates).length > 0) {
                const { error: upErr } = await supabase.from('proposals').update(updates).eq('id', r.id);
                if (upErr) console.warn('  ⚠ update error', r.id, upErr.message);
                else totalEnriched++;
            }
        }

        offset += rows.length;
        if (offset % 500 === 0) {
            console.log(`  progress: ${offset} | enriched=${totalEnriched} sectors+${totalSectorAdded} intent~${totalIntentFixed} geo+${totalGeoAdded} struct+${totalStructureAdded} tier-changes=${totalTierChanged}`);
        }
    }

    console.log(`\n✅ DONE — ${totalEnriched} proposals enriched`);
    console.log(`   sectors added:    ${totalSectorAdded}`);
    console.log(`   intent fixed:     ${totalIntentFixed}`);
    console.log(`   geography added:  ${totalGeoAdded}`);
    console.log(`   structure added:  ${totalStructureAdded}`);
    console.log(`   tier changes:     ${totalTierChanged}`);
    console.log(`\nNext: npx tsx scripts/seed-embeddings.ts`);
}

main().catch(console.error);