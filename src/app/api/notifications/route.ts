import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: notifications, error: notifErr } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', dbUser.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (notifErr) throw notifErr;

    return NextResponse.json(notifications || []);
  } catch (error: unknown) {
    console.error("🔥 GET /api/notifications ERROR:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id } = body;

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: notification, error: updateErr } = await supabase
      .from('notifications')
      // is_read is a BOOLEAN column — write a boolean, not the string 'true'.
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', dbUser.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json(notification);
  } catch (error: unknown) {
    console.error("🔥 PATCH /api/notifications ERROR:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}