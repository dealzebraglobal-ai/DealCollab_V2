import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { resolveDbUser } from '@/lib/resolveDbUser';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

// Mirrors resolveDbUser.ts's SessionUserLike shape — session.user may carry id/phone
// (WhatsApp-linked sessions) in addition to email, and email-only lookup silently
// resolves to the WRONG users.id (or no row at all) for those sessions. That mismatch
// is exactly what made mark-as-read look like it "didn't persist": the PATCH below
// filters by user_id, so if dbUser.id is wrong, zero rows match, the update errors out,
// and the immediate revalidation refetches the still-unread row from the database.
type AuthUserLike = { id?: string; email?: string; phone?: string };

export async function GET() {
  try {
    const session = await auth();
    const authUser = session?.user as AuthUserLike | undefined;
    if (!authUser?.id && !authUser?.email && !authUser?.phone) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const dbUser = await resolveDbUser<{ id: string }>(supabase, authUser, 'id');
    if (!dbUser) {
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
    const authUser = session?.user as AuthUserLike | undefined;
    if (!authUser?.id && !authUser?.email && !authUser?.phone) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, markAll } = body as { id?: string; markAll?: boolean };

    if (!id && !markAll) {
      return NextResponse.json({ error: 'id or markAll is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const dbUser = await resolveDbUser<{ id: string }>(supabase, authUser, 'id');
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // "Mark all as read" — previously CLIENT-STATE ONLY (no request was ever sent),
    // which is why it silently reverted on the very next refresh/poll. Persists for
    // real now: every one of this user's currently-unread notifications.
    if (markAll) {
      const { data: updated, error: updateErr } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', dbUser.id)
        .eq('is_read', false)
        .select('id');

      if (updateErr) throw updateErr;
      return NextResponse.json({ success: true, updatedCount: updated?.length ?? 0 });
    }

    const { data: notification, error: updateErr } = await supabase
      .from('notifications')
      // is_read is a BOOLEAN column — write a boolean, not the string 'true'.
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', dbUser.id)
      .select()
      .single();

    // A failed/no-op update must never report success — this is exactly the "read
    // notification reverts to unread" bug class: the write silently doesn't happen
    // (wrong user_id resolution, wrong id, RLS, etc.) but the caller treats it as done.
    if (updateErr || !notification) {
      console.error('🔥 PATCH /api/notifications: update matched no row', { id, userId: dbUser.id, updateErr });
      return NextResponse.json({ error: 'Notification not found or already updated' }, { status: 404 });
    }

    return NextResponse.json(notification);
  } catch (error: unknown) {
    console.error("🔥 PATCH /api/notifications ERROR:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}