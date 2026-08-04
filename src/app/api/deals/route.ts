import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

// ─── Types returned by the get_deals_for_user RPC ────────────────────────────
interface DealRow {
  proposal_id: string;
  proposal_intent: string | null;
  proposal_sectors: string[] | null;
  proposal_geographies: string[] | null;
  proposal_size_min: number | null;
  proposal_size_max: number | null;
  proposal_status: string | null;
  proposal_created_at: string | null;
  proposal_raw_text: string | null;
  proposal_normalised_text: string | null;
  proposal_summary_text: string | null;
  proposal_metadata: Record<string, unknown> | null;
  proposal_source: string | null;
  // Match columns — null when the proposal has no matches
  match_id: string | null;
  match_similarity_score: number | null;
  match_final_score: number | null;
  match_reason: string | null;
  matched_proposal_id: string | null;
  // Counterparty proposal columns — null when the proposal has no matches
  cp_intent: string | null;
  cp_sectors: string[] | null;
  cp_geographies: string[] | null;
  cp_size_min: number | null;
  cp_size_max: number | null;
  cp_deal_structure: string | null;
  cp_raw_text: string | null;
  cp_normalised_text: string | null;
  cp_summary_text: string | null;
  cp_metadata: Record<string, unknown> | null;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    // ── 1. Resolve user ID ──────────────────────────────────────────────────
    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── 2. Single RPC call — no .in() filter, no URL overflow ───────────────
    //
    //  PREVIOUS PATTERN (broken with large datasets):
    //    query 1: proposals → array of UUIDs
    //    query 2: proposal_matches.in('proposal_id', [...uuids])
    //             ↳ PostgREST encodes this as a GET URL parameter:
    //               ?proposal_id=in.(uuid1,uuid2,...,uuidN)&select=...
    //             ↳ URL grows by ~36 chars per UUID → HeadersOverflowError
    //               at ~200+ proposals (observed: 15,771-char URL)
    //
    //  CURRENT PATTERN (scalable):
    //    Single RPC call: { p_user_id: uuid }
    //    The JOIN is done server-side in Postgres — URL is always ~150 chars.
    //
    const { data: rows, error: rpcErr } = await supabase
      .rpc('get_deals_for_user', { p_user_id: dbUser.id });

    if (rpcErr) {
      console.error('🔥 GET /api/deals RPC error:', rpcErr);
      throw rpcErr;
    }

    const dealRows = (rows ?? []) as DealRow[];
    console.log(`[/api/deals] user=${dbUser.id} rpc_rows=${dealRows.length}`);

    // ── 3. Group flat RPC rows into per-proposal objects ────────────────────
    //
    // The RPC returns one row per (proposal, match) pair via LEFT JOIN.
    // A proposal with zero matches appears once with all match/cp columns NULL.
    //
    const proposalMap = new Map<string, {
      id: string;
      intent: string | null;
      sectors: string[] | null;
      geographies: string[] | null;
      deal_size_min_cr: number | null;
      deal_size_max_cr: number | null;
      status: string | null;
      created_at: string | null;
      raw_text: string | null;
      normalised_text: string | null;
      summary_text: string | null;
      metadata: Record<string, unknown> | null;
      source: string | null;
      matches: Array<{
        id: string;
        score: number | null;
        similarity: number | null;
        reason: string | null;
        matchedProposalId: string | null;
        counterparty: {
          intent: string | null;
          sectors: string[] | null;
          geographies: string[] | null;
          size_min: number | null;
          size_max: number | null;
          raw_text: string | null;
          normalised_text: string | null;
          summary_text: string | null;
          mandate_summary: string | null;
        } | null;
      }>;
    }>();

    for (const row of dealRows) {
      // Upsert the proposal record
      if (!proposalMap.has(row.proposal_id)) {
        proposalMap.set(row.proposal_id, {
          id: row.proposal_id,
          intent: row.proposal_intent,
          sectors: row.proposal_sectors,
          geographies: row.proposal_geographies,
          deal_size_min_cr: row.proposal_size_min,
          deal_size_max_cr: row.proposal_size_max,
          status: row.proposal_status,
          created_at: row.proposal_created_at,
          raw_text: row.proposal_raw_text,
          normalised_text: row.proposal_normalised_text,
          summary_text: row.proposal_summary_text,
          metadata: row.proposal_metadata,
          source: row.proposal_source,
          matches: [],
        });
      }

      // Attach match data if this row has a match (match_id != null)
      if (row.match_id) {
        const proposal = proposalMap.get(row.proposal_id)!;
        proposal.matches.push({
          id: row.match_id,
          score: row.match_final_score,
          similarity: row.match_similarity_score,
          reason: row.match_reason,
          matchedProposalId: row.matched_proposal_id,
          counterparty: {
            intent: row.cp_intent,
            sectors: row.cp_sectors,
            geographies: row.cp_geographies,
            size_min: row.cp_size_min,
            size_max: row.cp_size_max,
            raw_text: row.cp_raw_text,
            normalised_text: row.cp_normalised_text,
            summary_text: row.cp_summary_text ?? null,
            mandate_summary: (row.cp_metadata as Record<string, unknown> | null)?.mandate_summary as string | null ?? null,
          },
        });
      }
    }

    const hydratedDeals = Array.from(proposalMap.values());
    console.log(`[/api/deals] returning ${hydratedDeals.length} proposals`);

    return NextResponse.json(hydratedDeals);

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("🔥 GET /api/deals ERROR:", error);
    // Always return a structured error — never throw to Next.js unhandled
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
