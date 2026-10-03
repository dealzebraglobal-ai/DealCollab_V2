import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSize } from '@/lib/dataQuality';
import { AdvisorRequirementItem } from '@/lib/validation/profile';
import { resolveDbUser } from '@/lib/resolveDbUser';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const user = await resolveDbUser(supabase, session.user, 'id');
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: reqs, error } = await supabase
      .from('advisor_requirements')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
      .order('slot_index', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ requirements: reqs || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const user = await resolveDbUser(supabase, session.user, 'id');
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = (await req.json()) as AdvisorRequirementItem;
    if (!body.slotIndex || !body.sectors || body.sectors.length === 0 || !body.niche?.trim()) {
      return NextResponse.json(
        { error: 'Slot index, sectors, and niche are required' },
        { status: 400 }
      );
    }

    const sizeNorm = body.revenue ? normalizeSize(body.revenue) : null;

    const rowPayload = {
      user_id: user.id,
      slot_index: body.slotIndex,
      intent: 'BUY_SIDE',
      sectors: body.sectors || [],
      niche: body.niche.trim(),
      cities: body.cities || [],
      revenue_raw: body.revenue ? body.revenue.trim() : null,
      revenue_min_cr: sizeNorm?.min_cr ?? null,
      revenue_max_cr: sizeNorm?.max_cr ?? null,
      details: body.details ? body.details.trim() : null,
      business_models: body.businessModels || [],
      deal_structures: body.dealStructures || [],
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    };

    console.log('[API REQ SAVE] Upserting requirement slot:', body.slotIndex, 'for user:', user.id);

    const { data: savedRow, error: saveErr } = await supabase
      .from('advisor_requirements')
      .upsert(rowPayload, { onConflict: 'user_id,slot_index' })
      .select('*')
      .single();

    if (saveErr) {
      console.error('[API REQ SAVE] Supabase upsert error:', saveErr);
      return NextResponse.json({ error: saveErr.message }, { status: 500 });
    }

    // Trigger non-blocking async embedding generation
    if (savedRow?.id) {
      triggerAsyncEmbedding(savedRow.id, rowPayload).catch(e =>
        console.error('[API REQ SAVE] Async embedding error:', e)
      );
    }

    return NextResponse.json({
      success: true,
      requirement: savedRow,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API REQ SAVE] Unexpected error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const user = await resolveDbUser(supabase, session.user, 'id');
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const slotParam = req.nextUrl.searchParams.get('slotIndex');
    if (!slotParam) {
      return NextResponse.json({ error: 'slotIndex is required' }, { status: 400 });
    }

    const slotIndex = parseInt(slotParam, 10);
    const { error: delErr } = await supabase
      .from('advisor_requirements')
      .delete()
      .eq('user_id', user.id)
      .eq('slot_index', slotIndex);

    if (delErr) throw delErr;

    return NextResponse.json({ success: true, slotIndex });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function triggerAsyncEmbedding(requirementId: string, payload: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;

  const supabase = createServerSupabaseClient();
  if (!supabase) return;

  const sectors = (payload.sectors as string[]) || [];
  const niche = (payload.niche as string) || '';
  const cities = (payload.cities as string[]) || [];
  const revenue = (payload.revenue_raw as string) || '';
  const details = (payload.details as string) || '';
  const models = (payload.business_models as string[]) || [];
  const structs = (payload.deal_structures as string[]) || [];

  const canonicalText = [
    `Buy-side mandate target requirement.`,
    sectors.length ? `Sectors: ${sectors.join(', ')}.` : '',
    niche ? `Niche focus: ${niche}.` : '',
    cities.length ? `Target geography / regions: ${cities.join(', ')}.` : '',
    revenue ? `Target revenue: ${revenue}.` : '',
    details ? `Must have / criteria: ${details}.` : '',
    models.length ? `Business models: ${models.join(', ')}.` : '',
    structs.length ? `Deal structure: ${structs.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: canonicalText,
    });

    const vector = response.data[0]?.embedding;
    if (vector && vector.length) {
      await supabase.rpc('update_advisor_requirement_embedding', {
        requirement_id: requirementId,
        embedding_vector: JSON.stringify(vector),
      });
      console.log(`[API REQ SAVE] Embedding generated and saved for requirement ${requirementId}`);
    }
  } catch (err) {
    console.error(`[API REQ SAVE] Embedding failed for ${requirementId}:`, err);
  }
}
