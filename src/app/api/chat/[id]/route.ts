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

    // Resolve DB user id (handles NextAuth id ↔ DB id mismatch)
    let dbUserId: string = session.user.id;
    if (session.user.email) {
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', session.user.email)
        .single();
      if (dbUser?.id) dbUserId = dbUser.id;
    }

    // Fetch chat session — plain select, no FK join to avoid PostgREST schema-cache errors
    const { data: chat, error: chatErr } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (chatErr) {
      console.error(`[chat/${id}] session fetch error:`, chatErr);
      return NextResponse.json({ success: false, error: 'Chat not found' }, { status: 404 });
    }
    if (!chat) {
      return NextResponse.json({ success: false, error: 'Chat not found' }, { status: 404 });
    }

    // Fetch document separately if a document_id exists on the session
    let document: Record<string, unknown> | null = null;
    if (chat.document_id) {
      const { data: doc } = await supabase
        .from('documents')
        .select('*')
        .eq('id', chat.document_id)
        .maybeSingle();
      document = doc ?? null;
    }

    // Fetch messages (consolidated here to avoid nested dynamic route issues)
    const { data: rawMessages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', id)
      .order('created_at', { ascending: true });

    const messages = (rawMessages ?? []).map((m: Record<string, unknown>) => {
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content as string);
          return { ...m, content: parsed.message || m.content };
        } catch { return m; }
      }
      return m;
    });

    // Resolve proposalId for the match panel.
    // ONLY use state.proposal_id — the fallback intent/sector query was removed because
    // it scanned by user+intent+sector without a chatId filter, returning proposals from
    // OTHER sessions that share the same intent/sector (BUG #2 stale-match root cause).
    // The sessionStorage dc_proposal_map fallback in the frontend handles older sessions.
    const chatState = (chat.state ?? {}) as Record<string, unknown>;
    let proposalId: string | null = null;

    if (chatState.proposal_id) {
      proposalId = chatState.proposal_id as string;
      console.log(`[chat/${id}] proposalId from state: ${proposalId}`);
    } else {
      console.log(`[chat/${id}] no proposalId in state — frontend sessionStorage fallback will handle this`);
    }

    return NextResponse.json({
      success: true,
      ...chat,
      document,     // fetched separately to avoid FK join failures
      proposalId,   // consumed by ChatProvider.loadChat to restore the MatchPanel
      messages,     // consolidated here to avoid nested dynamic route issues
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
