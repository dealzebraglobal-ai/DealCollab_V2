/**
 * POST /api/consent/accept
 * ========================
 * Called when the user ticks the consent box at 100% profile completion.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { recordAcceptance, hasAcceptedTerms } from '@/lib/consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'You must be logged in to accept terms.' },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    if (body?.accepted !== true) {
      return NextResponse.json(
        { error: 'consent_not_given', message: 'You must accept the Terms to continue.' },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'database_error', message: 'Database connection failed. Please try again.' },
        { status: 500 },
      );
    }

    const email = session.user.email.trim().toLowerCase();
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .single();

    if (userErr || !user) {
      return NextResponse.json(
        { error: 'user_not_found', message: 'User profile not found.' },
        { status: 404 },
      );
    }

    const authUserId = session.user.id;
    const dbUserId = user.id;

    // Check if already accepted
    const already = await hasAcceptedTerms(dbUserId, authUserId);
    if (already) {
      return NextResponse.json({ ok: true, alreadyAccepted: true });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const rec = await recordAcceptance(dbUserId, { ip, userAgent }, authUserId);
    if (!rec.ok) {
      console.error('[POST /api/consent/accept] recordAcceptance failed:', rec.error);
      return NextResponse.json(
        { error: 'record_failed', message: rec.error || 'Failed to record terms acceptance.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, balance: user.tokens });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[POST /api/consent/accept] Exception:', errorMsg);
    return NextResponse.json(
      { error: 'server_error', message: errorMsg },
      { status: 500 },
    );
  }
}
