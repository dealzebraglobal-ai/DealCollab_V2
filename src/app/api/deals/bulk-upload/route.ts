// src/app/api/deals/bulk-upload/route.ts
/**
 * Bulk Uploaded Mandates — ingestion endpoint.
 *
 * Isolated extension: creates `proposals` rows tagged source='BULK' and runs
 * them through the EXISTING matchmaking engine (executeMatchmaking). Does not
 * touch chat_sessions, the legacy `mandates` table, or the `deals` dashboard
 * table — those stay exclusive to the chat mandate flow.
 *
 * Accepts multipart/form-data with a repeated `files` field:
 *   - .csv           → one row = one mandate (spreadsheet import)
 *   - .pdf/.docx/.doc/.txt → one file = one mandate (document import,
 *     reuses documentParser.ts + intelligenceEngine.ts, same as chat's
 *     parse-document pipeline)
 */

import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { extractTextFromFile } from '@/lib/documentParser';
import { normalizeIntent, normalizeSize } from '@/lib/dataQuality';
import {
  detectIntentFromText,
  detectSectorFromText,
  detectStructureFromText,
  detectDealSizeFromText,
  detectRevenueFromText,
  VALID_SECTOR_KEYS,
} from '@/lib/promptRouter';
import type { DealIntent, SectorKey } from '@/lib/promptRouter';
import { executeMatchmaking, type ProposalInput } from '@/lib/matchmakingEngine';
import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILES_PER_REQUEST = 25;
const MAX_ROWS_PER_CSV = 100;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const DOCUMENT_MIME_TO_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
};

interface RowResult {
  file: string;
  row?: number;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
  proposalId?: string;
  matchCount?: number;
}

function isCsv(file: File): boolean {
  return file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
}

// Accepts common header spellings and normalizes to a canonical field name.
const HEADER_ALIASES: Record<string, string> = {
  intent: 'intent', deal_type: 'intent', type: 'intent', transaction_type: 'intent',
  sector: 'sector', industry: 'sector',
  sub_sector: 'sub_sector', subsector: 'sub_sector',
  geography: 'geography', location: 'geography', city: 'geography', region: 'geography',
  deal_size: 'deal_size', ticket_size: 'deal_size', investment_size: 'deal_size', size: 'deal_size',
  revenue: 'revenue', annual_revenue: 'revenue', turnover: 'revenue',
  structure: 'structure', transaction_structure: 'structure', deal_structure: 'structure',
  intent_focus: 'intent_focus', rationale: 'intent_focus', purpose: 'intent_focus',
  title: 'title', mandate_title: 'title', company: 'title', company_name: 'title',
  description: 'description', raw_text: 'description', summary: 'description', notes: 'description', details: 'description',
};

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const canon = HEADER_ALIASES[key.trim().toLowerCase().replace(/\s+/g, '_')];
    if (canon && value != null && String(value).trim() !== '') out[canon] = String(value).trim();
  }
  return out;
}

function buildProposalInputFromRow(row: Record<string, string>, userId: string): { input: ProposalInput | null; reason?: string } {
  const description = row.description || Object.values(row).join(' — ');

  const intent = normalizeIntent(row.intent) ?? detectIntentFromText(description);
  if (!intent) return { input: null, reason: 'Could not determine deal intent (buy/sell/raise/debt/partner)' };

  const rawSector = row.sector?.toLowerCase().trim();
  const sector: SectorKey | null = (rawSector && (VALID_SECTOR_KEYS as readonly string[]).includes(rawSector))
    ? (rawSector as SectorKey)
    : detectSectorFromText(description);

  const sizeParsed = normalizeSize(row.deal_size || '');
  const revenueParsed = normalizeSize(row.revenue || '');

  const input: ProposalInput = {
    mandateId: crypto.randomUUID(),
    userId,
    intent,
    raw_text: description,
    sector,
    sub_sector: row.sub_sector || null,
    geography: row.geography || null,
    deal_size: row.deal_size || null,
    revenue: row.revenue || null,
    structure: row.structure || detectStructureFromText(description),
    intent_focus: row.intent_focus || null,
    industry_data: row.title ? { title: row.title } : {},
    special_conditions: [],
    deal_size_min: sizeParsed?.min_cr != null ? String(sizeParsed.min_cr) : null,
    deal_size_max: sizeParsed?.max_cr != null ? String(sizeParsed.max_cr) : null,
    revenue_min: revenueParsed?.min_cr != null ? String(revenueParsed.min_cr) : null,
    revenue_max: revenueParsed?.max_cr != null ? String(revenueParsed.max_cr) : null,
    source: 'BULK',
  };

  return { input };
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase client init failed');

    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userId = dbUser.id as string;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data — send files as multipart/form-data' }, { status: 400 });
    }

    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided under the "files" field' }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `Too many files — max ${MAX_FILES_PER_REQUEST} per upload` }, { status: 400 });
    }

    const results: RowResult[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        results.push({ file: file.name, status: 'error', reason: 'File too large (max 10MB)' });
        continue;
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (isCsv(file)) {
        // ── Spreadsheet path: one row = one mandate ──────────────
        const csvText = buffer.toString('utf-8');
        const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

        if (parsed.errors.length > 0 && parsed.data.length === 0) {
          results.push({ file: file.name, status: 'error', reason: 'Could not parse CSV file' });
          continue;
        }

        const rows = parsed.data.slice(0, MAX_ROWS_PER_CSV);
        for (let i = 0; i < rows.length; i++) {
          const normalized = normalizeRow(rows[i]);
          const { input, reason } = buildProposalInputFromRow(normalized, userId);
          if (!input) {
            results.push({ file: file.name, row: i + 2, status: 'skipped', reason });
            continue;
          }
          try {
            const match = await executeMatchmaking(input);
            results.push({
              file: file.name, row: i + 2, status: 'created',
              proposalId: match?.proposalId, matchCount: match?.matchCount ?? 0,
            });
          } catch (err) {
            results.push({ file: file.name, row: i + 2, status: 'error', reason: err instanceof Error ? err.message : String(err) });
          }
        }
        continue;
      }

      // ── Document path: one file = one mandate ──────────────────
      const docType = DOCUMENT_MIME_TO_TYPE[file.type];
      if (!docType) {
        results.push({ file: file.name, status: 'error', reason: `Unsupported file type: ${file.type || 'unknown'}` });
        continue;
      }

      try {
        const extractedText = await extractTextFromFile(buffer, file.type);
        const cleanText = extractedText.trim();
        if (!cleanText) {
          results.push({ file: file.name, status: 'error', reason: 'No text could be extracted from this document' });
          continue;
        }

        const { cleanAndStructureDocument } = await import('@/lib/intelligenceEngine');
        const { initializeStateFromDocument } = await import('@/lib/promptRouter');

        let structuredData: Record<string, unknown> = {};
        try {
          const raw = await cleanAndStructureDocument(cleanText);
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            structuredData = raw as unknown as Record<string, unknown>;
          }
        } catch (intelErr) {
          console.warn('[bulk-upload] cleanAndStructureDocument failed, continuing with raw text only:', intelErr);
        }

        const state = initializeStateFromDocument(structuredData);

        // Document intelligence doesn't extract intent/deal-size directly — fall back
        // to the same text detectors chat uses for these fields.
        const intent: DealIntent = state.intent ?? detectIntentFromText(cleanText);
        if (!intent) {
          results.push({ file: file.name, status: 'skipped', reason: 'Could not determine deal intent (buy/sell/raise/debt/partner) from document' });
          continue;
        }
        const dealSizeText = state.deal_size ?? detectDealSizeFromText(cleanText);
        const revenueText = state.revenue ?? detectRevenueFromText(cleanText);
        const sizeParsed = normalizeSize(dealSizeText || '');
        const revenueParsed = normalizeSize(revenueText || '');

        // Best-effort storage upload for the document URL — non-blocking if it fails.
        let documentUrl: string | null = null;
        try {
          const storageName = `${userId}/bulk/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const { error: uploadErr } = await supabase.storage.from('pdfs').upload(storageName, buffer, {
            contentType: file.type,
            upsert: true,
          });
          if (!uploadErr) {
            documentUrl = supabase.storage.from('pdfs').getPublicUrl(storageName).data.publicUrl;
          }
        } catch (storageErr) {
          console.warn('[bulk-upload] Storage upload failed (non-blocking):', storageErr);
        }

        const input: ProposalInput = {
          mandateId: crypto.randomUUID(),
          userId,
          intent,
          raw_text: cleanText,
          sector: state.sector,
          industry: state.industry,
          sub_sector: state.sub_sector,
          geography: state.geography,
          deal_size: dealSizeText,
          revenue: revenueText,
          structure: state.structure ?? detectStructureFromText(cleanText),
          intent_focus: state.intent_focus,
          industry_data: state.industry_data ?? {},
          special_conditions: [],
          deal_size_min: sizeParsed?.min_cr != null ? String(sizeParsed.min_cr) : null,
          deal_size_max: sizeParsed?.max_cr != null ? String(sizeParsed.max_cr) : null,
          revenue_min: revenueParsed?.min_cr != null ? String(revenueParsed.min_cr) : null,
          revenue_max: revenueParsed?.max_cr != null ? String(revenueParsed.max_cr) : null,
          document_url: documentUrl,
          document_text: cleanText,
          source: 'BULK',
        };

        const match = await executeMatchmaking(input);
        results.push({
          file: file.name, status: 'created',
          proposalId: match?.proposalId, matchCount: match?.matchCount ?? 0,
        });
      } catch (err) {
        results.push({ file: file.name, status: 'error', reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({ success: true, created, skipped, errors, results });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('🔥 POST /api/deals/bulk-upload ERROR:', error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
