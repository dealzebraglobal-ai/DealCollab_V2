import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { hasAcceptedTerms } from '@/lib/consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ accepted: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase client failed to initialize');

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (!user) {
      return NextResponse.json({ accepted: false, error: 'User not found' }, { status: 404 });
    }

    const accepted = await hasAcceptedTerms(user.id, session.user.id);
    return NextResponse.json({ accepted });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ accepted: false, error: errorMsg }, { status: 500 });
  }
}
