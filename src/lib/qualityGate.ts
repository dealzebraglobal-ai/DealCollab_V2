import type { RouterState } from './types';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface QualityGateResult {
    passed: boolean;
    score: number;       // 0–10
    missing: string[];     // human-readable missing field names
    message: string;       // ready-to-deliver bot message when gate fails
}

// ─────────────────────────────────────────────────────────────
// FIELD LABELS — human-readable names for missing field messages
// ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
    sector: 'industry or sector',
    geography: 'city, state, or region',
    revenue: 'approximate annual revenue or business size',
    deal_size: 'approximate budget or ticket size',
    structure: 'preferred transaction structure',
    intent_focus: 'strategic rationale or purpose of funding',
    sub_sector: 'business type or sub-sector',
};

// ─────────────────────────────────────────────────────────────
// COMPUTE QUALITY GATE
// ─────────────────────────────────────────────────────────────

export function computeQualityGate(state: RouterState): QualityGateResult {
    if (!state.intent) {
        return {
            passed: false,
            score: 0,
            missing: ['intent (buy, sell, raise, or partner)'],
            message: 'To register this mandate, we first need to understand what you are looking to do — are you buying, selling, raising funds, or seeking a partner?',
        };
    }

    let score = 0;
    const missingKeys: string[] = [];
    const hardFailed: string[] = [];

    // ── SELL_SIDE ────────────────────────────────────────────
    if (state.intent === 'SELL_SIDE') {
        if (state.sector) score += 2; else { missingKeys.push('sector'); hardFailed.push('sector'); }
        if (state.geography) score += 2; else { missingKeys.push('geography'); hardFailed.push('geography'); }
        if (state.revenue || state.deal_size) score += 3; else { missingKeys.push('revenue'); hardFailed.push('revenue'); }
        if (state.structure) score += 1; else missingKeys.push('structure');
        if (state.sub_sector) score += 1;
        if (state.intent_focus) score += 1;
        const passed = score >= 7 && hardFailed.length === 0;
        return buildResult(passed, score, missingKeys, hardFailed);
    }

    // ── BUY_SIDE ─────────────────────────────────────────────
    if (state.intent === 'BUY_SIDE') {
        if (state.sector) score += 2; else { missingKeys.push('sector'); hardFailed.push('sector'); }
        if (state.geography) score += 2; else { missingKeys.push('geography'); hardFailed.push('geography'); }
        if (state.deal_size) score += 2; else { missingKeys.push('deal_size'); hardFailed.push('deal_size'); }
        if (state.structure) score += 1; else missingKeys.push('structure');
        if (state.intent_focus) score += 2; else missingKeys.push('intent_focus');
        if (state.sub_sector) score += 1;
        const passed = score >= 6 && hardFailed.length === 0;
        return buildResult(passed, score, missingKeys, hardFailed);
    }

    // ── FUNDRAISING ───────────────────────────────────────────
    if (state.intent === 'FUNDRAISING') {
        if (state.sector) score += 2; else { missingKeys.push('sector'); hardFailed.push('sector'); }
        if (state.deal_size) score += 3; else { missingKeys.push('deal_size'); hardFailed.push('deal_size'); }
        if (state.revenue) score += 2; else missingKeys.push('revenue');
        if (state.structure) score += 1; else missingKeys.push('structure');
        if (state.sub_sector) score += 1;
        if (state.intent_focus) score += 1;
        const passed = score >= 5 && hardFailed.length === 0;
        return buildResult(passed, score, missingKeys, hardFailed);
    }

    // ── DEBT ─────────────────────────────────────────────────
    if (state.intent === 'DEBT') {
        if (state.sector) score += 2; else { missingKeys.push('sector'); hardFailed.push('sector'); }
        if (state.deal_size) score += 3; else { missingKeys.push('deal_size'); hardFailed.push('deal_size'); }
        if (state.intent_focus) score += 2; else { missingKeys.push('intent_focus'); hardFailed.push('intent_focus'); }
        if (state.revenue) score += 2; else missingKeys.push('revenue');
        if (state.geography) score += 1; else missingKeys.push('geography');
        const passed = score >= 7 && hardFailed.length === 0;
        return buildResult(passed, score, missingKeys, hardFailed);
    }

    // ── STRATEGIC_PARTNERSHIP ─────────────────────────────────
    if (state.intent === 'STRATEGIC_PARTNERSHIP') {
        if (state.sector) score += 2; else { missingKeys.push('sector'); hardFailed.push('sector'); }
        if (state.geography) score += 2; else { missingKeys.push('geography'); hardFailed.push('geography'); }
        if (state.intent_focus) score += 3; else { missingKeys.push('intent_focus'); hardFailed.push('intent_focus'); }
        if (state.structure) score += 1; else missingKeys.push('structure');
        if (state.deal_size) score += 1;
        if (state.sub_sector) score += 1;
        const passed = score >= 7 && hardFailed.length === 0;
        return buildResult(passed, score, missingKeys, hardFailed);
    }

    return { passed: false, score: 0, missing: [], message: '' };
}

// ─────────────────────────────────────────────────────────────
// BUILD RESULT — internal helper
// ─────────────────────────────────────────────────────────────

function buildResult(
    passed: boolean,
    score: number,
    missingKeys: string[],
    hardFailed: string[],
): QualityGateResult {
    const missing = missingKeys.map(k => FIELD_LABELS[k] ?? k);
    const hardMissing = hardFailed.map(k => FIELD_LABELS[k] ?? k);

    const message = hardMissing.length > 0
        ? `To register this mandate and begin matching, we need: ${hardMissing.join(', ')}. Share these and we'll proceed immediately.`
        : '';

    return { passed, score, missing, message };
}