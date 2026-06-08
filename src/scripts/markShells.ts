/**
 * DealCollab — Mark Shell Companies Script
 * =========================================
 * Place at: src/scripts/markShells.ts
 *
 * Usage:
 *   npx tsx src/scripts/markShells.ts --dry-run   ← review only, touches nothing
 *   npx tsx src/scripts/markShells.ts --apply      ← marks shells + logs everything
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Safe to re-run — idempotent in both modes.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ Missing: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';

// ─────────────────────────────────────────────────────────────
// SHELL SCORING RULES
// Score >= 3 → marked as shell
// ─────────────────────────────────────────────────────────────

interface ShellSignal {
    pattern: string | RegExp;
    points: number;
    label: string;
}

const SHELL_SIGNALS: ShellSignal[] = [
    // High confidence — 2 points each
    { pattern: /gst (not applied|never applied|not registered|surrendered|cancelled|inactive)/i, points: 2, label: 'GST not applied/surrendered' },
    { pattern: /non.?gst|no gst/i, points: 2, label: 'Non-GST entity' },
    { pattern: /section.?8 company/i, points: 2, label: 'Section 8 company' },
    { pattern: /dormant company|non.?operational company|inactive company/i, points: 2, label: 'Dormant/non-operational' },
    { pattern: /no operations|no business operations|nil operations|yet to commence operations/i, points: 2, label: 'No operations' },
    { pattern: /no loan book|loan book nil|zero loan book|no aum/i, points: 2, label: 'No loan book/AUM' },
    { pattern: /no employees|zero employees|nil employees|no staff/i, points: 2, label: 'No employees' },
    { pattern: /listed company available|available for (strategic )?takeover|listed entity available/i, points: 2, label: 'Listed entity for takeover' },
    { pattern: /freshly incorporated|newly incorporated/i, points: 2, label: 'Freshly/newly incorporated' },
    { pattern: /no loan book yet|loan book not yet|yet to (start|begin) (lending|operations)/i, points: 2, label: 'No loan book yet (early NBFC)' },

    // Medium confidence — 1 point each
    { pattern: /all complian(ce|ces) (up.?to.?date|in order|clear|good|done)/i, points: 1, label: 'All compliances up to date' },
    { pattern: /roc (compliant|filing upto date|upto date|current)/i, points: 1, label: 'ROC compliant' },
    { pattern: /paid.?up capital|authorized capital|authorised capital/i, points: 1, label: 'Capital structure mention' },
    { pattern: /shareholding pattern|promoter holding/i, points: 1, label: 'Shareholding pattern' },
    { pattern: /statutory dues (nil|clear|zero|none)/i, points: 1, label: 'Nil statutory dues' },
    { pattern: /(bse|nse) (sme|listed|emerged)|bse.?sme|nse.?sme/i, points: 1, label: 'BSE/NSE SME listed' },
    { pattern: /clean company|debt.?free company/i, points: 1, label: 'Clean/debt-free company' },
    { pattern: /date of incorporation|incorporated (in|on|during) 20\d\d/i, points: 1, label: 'Incorporation date focus' },
    { pattern: /ready.?to.?use company|shelf company|blank company/i, points: 1, label: 'Ready-to-use/shelf company' },
    { pattern: /no litigation|nil litigation|zero litigation|litigation free/i, points: 1, label: 'Nil litigation' },
    { pattern: /it (returns|filing) (compliant|upto date|clear)/i, points: 1, label: 'IT returns compliant' },
    { pattern: /80.?g|12.?a certificate|fcra (registration|approved)/i, points: 1, label: '80G/12A/FCRA registration' },
];

const OPERATIONAL_SIGNALS: ShellSignal[] = [
    { pattern: /₹[\d,]+ ?(cr|crore|lakh|l)|turnover of ₹|revenue of ₹|annual (revenue|turnover)/i, points: -2, label: 'Revenue figure' },
    { pattern: /\d+ (employees|staff|headcount|team members)/i, points: -2, label: 'Employee count' },
    { pattern: /ebitda|pat |profit after tax|net profit/i, points: -2, label: 'Profitability metrics' },
    { pattern: /arr|mrr|monthly recurring|annual recurring/i, points: -2, label: 'Recurring revenue metrics' },
    { pattern: /loan book of ₹|aum of ₹|portfolio of ₹/i, points: -2, label: 'Active loan book' },
    { pattern: /\d+[\+]? (customers|clients|patients|students|borrowers)/i, points: -2, label: 'Customer/client count' },
    { pattern: /operational since|established in \d{4}|running since|in operation/i, points: -1, label: 'Operational history' },
    { pattern: /occupancy rate|bed count|patient (volume|count)/i, points: -1, label: 'Healthcare operational metrics' },
];

interface ScoreResult {
    score: number;
    isShell: boolean;
    triggeredShell: string[];
    triggeredOps: string[];
}

function scoreProposal(text: string): ScoreResult {
    const triggered: { label: string; points: number }[] = [];

    for (const signal of [...SHELL_SIGNALS, ...OPERATIONAL_SIGNALS]) {
        const regex = signal.pattern instanceof RegExp
            ? signal.pattern
            : new RegExp(signal.pattern, 'i');
        if (regex.test(text)) {
            triggered.push({ label: signal.label, points: signal.points });
        }
    }

    const score = triggered.reduce((sum, t) => sum + t.points, 0);
    const triggeredShell = triggered.filter(t => t.points > 0).map(t => t.label);
    const triggeredOps = triggered.filter(t => t.points < 0).map(t => t.label);

    return { score, isShell: score >= 3, triggeredShell, triggeredOps };
}

async function main() {
    console.log(`🔍 DealCollab — Mark Shell Companies (${mode.toUpperCase()})`);
    console.log('='.repeat(60));
    console.log('Shell threshold: score >= 3\n');

    const { data: proposals, error } = await supabase
        .from('proposals')
        .select('id, raw_text, normalised_text, intent, sectors, is_shell, shell_score')
        .order('created_at', { ascending: true });

    if (error || !proposals) {
        console.error('❌ Fetch failed:', error);
        process.exit(1);
    }

    console.log(`📋 ${proposals.length} proposals to evaluate\n`);

    const results = { alreadyMarked: 0, newShells: 0, cleared: 0, operational: 0, errors: 0 };
    const shellRows: { id: string; score: number; signals: string[] }[] = [];
    const borderlineRows: { id: string; score: number; signals: string[] }[] = [];

    for (const proposal of proposals as Array<Record<string, unknown>>) {
        const id = proposal.id as string;
        const rawText = (proposal.raw_text as string) ?? '';
        const normText = (proposal.normalised_text as string) ?? '';
        const intent = (proposal.intent as string) ?? '';
        const sectors = ((proposal.sectors as string[]) ?? []).join(' ');
        const combined = [rawText, normText, intent, sectors].join(' ');

        const { score, isShell, triggeredShell } = scoreProposal(combined);

        if (isShell) {
            shellRows.push({ id, score, signals: triggeredShell });

            if (mode === 'apply') {
                const { error: updateErr } = await supabase
                    .from('proposals')
                    .update({ is_shell: true, shell_score: score })
                    .eq('id', id);

                if (updateErr) { console.error(`  ❌ ${id}:`, updateErr.message); results.errors++; }
                else if (proposal.is_shell) results.alreadyMarked++;
                else results.newShells++;
            } else {
                results.newShells++;
            }
        } else if (score >= 1 && score <= 2) {
            borderlineRows.push({ id, score, signals: triggeredShell });
            results.operational++;
        } else {
            results.operational++;
            if (mode === 'apply' && proposal.is_shell === true) {
                await supabase.from('proposals').update({ is_shell: false, shell_score: score }).eq('id', id);
                results.cleared++;
            }
        }
    }

    console.log('═'.repeat(60));
    console.log('SHELL CLASSIFICATIONS (score >= 3):');
    console.log('═'.repeat(60));
    shellRows.forEach(r => {
        console.log(`  [SHELL score:${r.score}] ${r.id}`);
        console.log(`    Signals: ${r.signals.join(', ')}`);
    });

    if (borderlineRows.length > 0) {
        console.log('\n' + '─'.repeat(60));
        console.log('BORDERLINE (score 1-2, review manually):');
        borderlineRows.forEach(r => {
            console.log(`  [BORDERLINE score:${r.score}] ${r.id}`);
            console.log(`    Signals: ${r.signals.join(', ')}`);
        });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('SUMMARY:');
    console.log(`  🐚 Shells identified:  ${shellRows.length}`);
    console.log(`  ⚠️  Borderline:         ${borderlineRows.length}`);
    console.log(`  ✅ Operational:        ${results.operational}`);
    if (mode === 'apply') {
        console.log(`  🆕 Newly marked:       ${results.newShells}`);
        console.log(`  ↩️  Cleared:            ${results.cleared}`);
        console.log(`  ❌ Errors:             ${results.errors}`);
        console.log(`\n✅ Applied to Supabase.`);
    } else {
        console.log(`\n⚠️  DRY-RUN — nothing written.`);
        console.log(`   Run: npx tsx src/scripts/markShells.ts --apply`);
    }
}

main().catch(err => { console.error('💥 Script crashed:', err); process.exit(1); });