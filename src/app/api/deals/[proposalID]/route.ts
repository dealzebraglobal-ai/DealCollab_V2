// src/app/api/deals/[proposalID]/route.ts
/**
 * PATCH — Deal Log rename/remark.
 *
 * Stores a user-defined custom_title/remark inside proposals.metadata (jsonb) —
 * no schema migration needed, no destructive write. The original title (derived
 * from intent+sector) is never touched; the Deal Log UI overlays custom_title
 * on top of it when present.
 *
 * DELETE — Deal Log deletion.
 *
 * Soft delete via the EXISTING `proposals.status` column (already the
 * ACTIVE / PENDING_ENRICHMENT convention this table uses) rather than a hard
 * DELETE or a new schema column. Reusing `status` means:
 *   - GET /api/deals (get_deals_for_user RPC) already filters `status = 'ACTIVE'`
 *     — a deleted proposal stops appearing with no RPC change needed.
 *   - The matching candidate queries (match_proposals RPC, /api/matches/route.ts)
 *     already filter `status = 'ACTIVE'` too — a deleted proposal can never
 *     surface as, or be matched against, a live counterparty.
 *   - proposal_matches / eois / notifications / documents rows are untouched —
 *     no cascade-delete risk, EOI history stays intact.
 */

import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { resolveDbUser } from '@/lib/resolveDbUser';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TITLE_LEN = 120;
const MAX_REMARK_LEN = 240;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ proposalID: string }> }
) {
  try {
    const session = await auth();
    const authUser = session?.user as { id?: string; email?: string; phone?: string } | undefined;
    if (!authUser?.id && !authUser?.email && !authUser?.phone) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const customTitle = typeof body.custom_title === 'string' ? body.custom_title.trim().slice(0, MAX_TITLE_LEN) : undefined;
    const remark = typeof body.remark === 'string' ? body.remark.trim().slice(0, MAX_REMARK_LEN) : undefined;

    if (customTitle === undefined && remark === undefined) {
      return NextResponse.json({ error: 'custom_title or remark is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const dbUser = await resolveDbUser<{ id: string }>(supabase, authUser, 'id');
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { proposalID } = await params;
    const { data: p, error: propErr } = await supabase
      .from('proposals')
      .select('id, user_id, metadata')
      .eq('id', proposalID)
      .single();

    if (propErr || !p) return NextResponse.json({ error: 'Mandate not found' }, { status: 404 });
    if (p.user_id !== dbUser.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const currentMetadata = (p.metadata as Record<string, unknown>) ?? {};
    const nextMetadata: Record<string, unknown> = {
      ...currentMetadata,
      updated_at: new Date().toISOString(),
      updated_by: dbUser.id,
    };
    // Empty string clears the field back to the auto-generated title/no remark.
    if (customTitle !== undefined) nextMetadata.custom_title = customTitle || null;
    if (remark !== undefined) nextMetadata.remark = remark || null;

    const { data: updated, error: updateErr } = await supabase
      .from('proposals')
      .update({ metadata: nextMetadata })
      .eq('id', proposalID)
      .select('id, metadata')
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, id: updated.id, metadata: updated.metadata });
  } catch (err) {
    console.error('🔥 PATCH /api/deals/[proposalID] ERROR:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ proposalID: string }> }
) {
  try {
    const session = await auth();
    const authUser = session?.user as { id?: string; email?: string; phone?: string } | undefined;
    if (!authUser?.id && !authUser?.email && !authUser?.phone) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const dbUser = await resolveDbUser<{ id: string }>(supabase, authUser, 'id');
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { proposalID } = await params;

    // Fetch + ownership check FIRST so a wrong-owner request gets a clean 403
    // instead of a silent no-op update (which the `.eq('user_id', ...)` guard
    // below would otherwise produce — 0 rows affected, no explicit signal).
    const { data: existing, error: fetchErr } = await supabase
      .from('proposals')
      .select('id, user_id, status, metadata')
      .eq('id', proposalID)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    if (existing.user_id !== dbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (existing.status === 'DELETED') {
      // Idempotent — a second delete click (e.g. a retried request) is a success, not an error.
      return NextResponse.json({ success: true, id: existing.id, alreadyDeleted: true });
    }

    const nextMetadata = {
      ...((existing.metadata as Record<string, unknown>) ?? {}),
      deleted_at: new Date().toISOString(),
      deleted_by: dbUser.id,
    };

    const { data: updated, error: updateErr } = await supabase
      .from('proposals')
      .update({ status: 'DELETED', metadata: nextMetadata })
      .eq('id', proposalID)
      .eq('user_id', dbUser.id) // belt-and-braces: mutation itself is ownership-scoped, not just the pre-check
      .select('id, status')
      .single();

    // A failed/no-op mutation must never report success — this is exactly the
    // "delete comes back after refresh" bug class: an API that returns 200
    // even though the row was never actually changed.
    if (updateErr || !updated || updated.status !== 'DELETED') {
      console.error('🔥 DELETE /api/deals/[proposalID] update failed:', updateErr, updated);
      return NextResponse.json({ error: 'Failed to delete deal' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: updated.id });
  } catch (err) {
    console.error('🔥 DELETE /api/deals/[proposalID] ERROR:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
