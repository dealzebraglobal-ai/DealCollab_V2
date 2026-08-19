import { NextRequest, NextResponse } from 'next/server';
import { getAdminAccess } from '@/lib/admin';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { generateAIResponse, cleanAIJSON } from '@/lib/ai/ai-client';
import OpenAI from 'openai';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let migrationApplied = false;

async function ensureMigrationApplied() {
    if (migrationApplied) return;
    try {
        const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260811_proposal_intelligence.sql');
        if (fs.existsSync(migrationPath)) {
            const sqlContent = fs.readFileSync(migrationPath, 'utf8');
            // Execute the raw SQL via drizzle db
            await db.execute(sql.raw(sqlContent));
            console.log('✅ Proposal Intelligence DB migration applied inline successfully.');
            migrationApplied = true;
        } else {
            console.warn('⚠️ Migration file not found at path, skipping inline application:', migrationPath);
        }
    } catch (err) {
        console.error('❌ Failed to apply inline migration in proposal-intelligence API:', err);
    }
}

async function requireAdmin() {
    const access = await getAdminAccess();
    if (!access.allowed) {
        return {
            access,
            response: NextResponse.json(
                {
                    error: 'Forbidden',
                    message: access.configured
                        ? 'Your email is not on the ADMIN_EMAILS allowlist.'
                        : 'ADMIN_EMAILS is not configured.',
                    email: access.email,
                    diagnostics: access.diagnostics,
                },
                { status: access.email ? 403 : 401 }
            ),
        };
    }
    return { access, response: null };
}

const EXTRACTOR_SYSTEM_PROMPT = `You are an AI assistant that extracts structural parameters from deal-making search queries.
Analyze the user's search query and identify if they are asking for:
- Intent: Must be one of [BUY_SIDE, SELL_SIDE, FUNDRAISING, DEBT, STRATEGIC_PARTNERSHIP] or null if not specified.
  Guidelines:
  - "sell side", "divestment", "exit", "selling" -> SELL_SIDE
  - "buy side", "acquisition", "investing in", "buying" -> BUY_SIDE
  - "debt", "loan", "credit", "refinance" -> DEBT
  - "fundraising", "equity raise", "capital raise", "series a/b/c" -> FUNDRAISING
  - "partnership", "joint venture", "strategic alliance" -> STRATEGIC_PARTNERSHIP
- Sector: The main business sector/industry mentioned (e.g. "Defence", "Manufacturing", "Pharma", "Tech"). Keep it singular, clean, and concise. Return null if none specified.
- Geography: The city, state, or country mentioned (e.g. "Mumbai", "India", "Delhi"). Keep it clean and concise. Return null if none specified.
- Keyword: The core keyword search term or null if none specified.

Provide the output strictly in JSON format as follows:
{
  "intent": "SELL_SIDE" | "BUY_SIDE" | "FUNDRAISING" | "DEBT" | "STRATEGIC_PARTNERSHIP" | null,
  "sector": string | null,
  "geography": string | null,
  "keyword": string | null
}`;

export async function GET(req: NextRequest) {
    try {
        const { access, response } = await requireAdmin();
        if (response) return response;

        // Apply db migration if not yet applied
        await ensureMigrationApplied();

        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase client failed to initialize');

        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query')?.trim() || '';
        const intentParam = searchParams.get('intent')?.trim() || '';
        const sectorParam = searchParams.get('sector')?.trim() || '';
        const geographyParam = searchParams.get('geography')?.trim() || '';
        const keywordParam = searchParams.get('keyword')?.trim() || '';
        const statusParam = searchParams.get('status')?.trim() || 'ACTIVE';
        const strictParam = searchParams.get('strict') === 'true';

        let extractedFilters = {
            intent: null as string | null,
            sector: null as string | null,
            geography: null as string | null,
            keyword: null as string | null,
        };

        // 1. If a natural language query is provided, extract structural parameters via AI
        if (query && !intentParam && !sectorParam && !geographyParam && !keywordParam) {
            try {
                const aiResponse = await generateAIResponse([
                    { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
                    { role: 'user', content: `Search Query: "${query}"` }
                ]);
                const cleaned = cleanAIJSON(aiResponse);
                const parsed = JSON.parse(cleaned);
                extractedFilters = {
                    intent: parsed.intent || null,
                    sector: parsed.sector || null,
                    geography: parsed.geography || null,
                    keyword: parsed.keyword || null,
                };
            } catch (err) {
                console.error('[PROPOSAL INTELLIGENCE] AI Extraction failed, fallback to none:', err);
            }
        }

        // Determine final filters: query overrides, or falling back to extracted filters
        const finalIntent = intentParam || extractedFilters.intent || null;
        const finalSector = sectorParam || extractedFilters.sector || null;
        const finalGeography = geographyParam || extractedFilters.geography || null;
        const finalKeyword = keywordParam || extractedFilters.keyword || null;

        // 2. Generate embedding if query is specified
        let embedding: number[] | null = null;
        if (query) {
            try {
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                const embRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: query,
                });
                embedding = embRes.data[0].embedding;
            } catch (err) {
                console.error('[PROPOSAL INTELLIGENCE] Embedding generation failed:', err);
            }
        }

        // 3. Query the database using the new RPC
        const { data: results, error: rpcError } = await supabase.rpc('search_proposals_intelligence', {
            query_embedding: embedding,
            filter_intent: finalIntent,
            filter_sector: finalSector,
            filter_geography: finalGeography,
            filter_keyword: finalKeyword,
            filter_status: statusParam,
            strict_filters: strictParam,
            result_count: 50,
        });

        if (rpcError) {
            console.error('[PROPOSAL INTELLIGENCE] Database RPC failed:', rpcError);
            return NextResponse.json({ error: 'Database search failed', details: rpcError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            results: results || [],
            query,
            extractedFilters: {
                intent: finalIntent,
                sector: finalSector,
                geography: finalGeography,
                keyword: finalKeyword,
                status: statusParam,
                strict: strictParam,
            },
        });
    } catch (error: unknown) {
        console.error('🔥 GET /api/admin/proposal-intelligence ERROR:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            },
            { status: 500 }
        );
    }
}
