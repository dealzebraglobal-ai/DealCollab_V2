import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email && !session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    let query = supabase.from('users').update({
      onboarding_tutorial_completed: true,
    });

    if (session.user.id) {
      query = query.eq('id', session.user.id);
    } else if (session.user.email) {
      query = query.ilike('email', session.user.email.trim().toLowerCase());
    }

    const { error } = await query;
    if (error) {
      console.error('[ONBOARDING TUTORIAL POST] Error updating status:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, onboarding_tutorial_completed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ONBOARDING TUTORIAL POST] Unhandled error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
