// src/app/api/admin/fix-encoding/route.ts
/**
 * One-time admin endpoint: batch-apply fixEncoding() to all existing proposals.
 * Proposals seeded from CSV before the encoding repair was added may have
 * mojibake (â€", â‚¹, Â ) baked into raw_text / normalised_text.
 * Corrupt text degrades embedding quality and cosine similarity scores.
 *
 * Usage: POST /api/admin/fix-encoding  (body: { secret: ADMIN_SECRET, batch?: number })
 * Returns: { fixed, skipped, errors, total }
 *
 * Safe to run multiple times — skips rows whose text has no mojibake.
 */

import { fixEncoding } from '@/lib/dataQuality';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5-minute cap (Vercel Pro)

const MOJIBAKE_PROBE = /â€["—–‘’]|â‚¹|Â |Ã/;

function hasMojibake(text: string | null): boolean {
    if (!text) return false;
    return MOJIBAKE_PROBE.test(text);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));

        // Simple secret guard — set ADMIN_SECRET in env
        const secret = process.env.ADMIN_SECRET || process.env.NEXTAUTH_SECRET;
        if (!secret || body.secret !== secret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const batchSize = Math.min(Number(body.batch) || 100, 200);
        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase client init failed');

        let offset = 0;
        let fixed = 0;
        let skipped = 0;
        let errors = 0;
        let total = 0;

        // Stream through all proposals in batches
        while (true) {
            const { data: rows, error: fetchErr } = await supabase
                .from('proposals')
                .select('id, raw_text, normalised_text')
                .range(offset, offset + batchSize - 1)
                .order('created_at', { ascending: true });

            if (fetchErr) throw new Error(fetchErr.message);
            if (!rows || rows.length === 0) break;

            total += rows.length;

            for (const row of rows) {
                const needsRaw = hasMojibake(row.raw_text);
                const needsNorm = hasMojibake(row.normalised_text);

                if (!needsRaw && !needsNorm) {
                    skipped++;
                    continue;
                }

                const update: Record<string, string> = {};
                if (needsRaw && row.raw_text) update.raw_text = fixEncoding(row.raw_text);
                if (needsNorm && row.normalised_text) update.normalised_text = fixEncoding(row.normalised_text);

                const { error: updateErr } = await supabase
                    .from('proposals')
                    .update({ ...update, embedding_status: 'PENDING' })
                    .eq('id', row.id);

                if (updateErr) {
                    console.error(`[fix-encoding] Failed row ${row.id}:`, updateErr.message);
                    errors++;
                } else {
                    fixed++;
                }
            }

            if (rows.length < batchSize) break;
            offset += batchSize;
        }

        console.log(`[fix-encoding] Done — total=${total} fixed=${fixed} skipped=${skipped} errors=${errors}`);
        return NextResponse.json({ total, fixed, skipped, errors });

    } catch (err) {
        console.error('[fix-encoding] Fatal:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
