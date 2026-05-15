import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    // Fetch chat session and join with document
    const { data: chat, error } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        document:documents(*)
      `)
      .eq('id', id)
      .single();

    if (error || !chat) {
      return NextResponse.json({ success: false, error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ...chat
    });

  } catch (error: unknown) {
    console.error('[CHAT DETAIL ERROR]:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client failed to initialize");

  try {
    // 1. Fetch DB ID by email (Identity mismatch fix)
    const { data: dbUser, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.user.email)
      .single();

    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User record missing' }, { status: 404 });
    }

    const userId = dbUser.id;

    // 2. Verify ownership before deletion
    const { data: chatSession, error: checkErr } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (checkErr || !chatSession) {
      return NextResponse.json({ error: 'Chat not found or access denied' }, { status: 404 });
    }

    // 3. Delete messages first (if not cascading)
    const { error: msgDelErr } = await supabase
      .from("chat_messages")
      .delete()
      .eq("chat_id", id);

    if (msgDelErr) {
      console.error("Failed to delete messages:", msgDelErr);
      throw new Error(msgDelErr.message);
    }

    // 4. Delete the session
    const { error: sessionDelErr } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", id);

    if (sessionDelErr) {
      console.error("Failed to delete session:", sessionDelErr);
      throw new Error(sessionDelErr.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE CHAT ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
