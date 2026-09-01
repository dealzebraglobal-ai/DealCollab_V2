import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log("[MESSAGES_ROUTE] GET hit for session messages");
  const session = await auth();
  if (!session?.user?.email) {
    console.warn("[MESSAGES_ROUTE] Unauthorized access attempt");
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    // 1. Resolve User ID
    let userId = session.user.id;
    if (!userId && session.user.email) {
      const { data: dbUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", session.user.email)
        .single();
      if (dbUser) userId = dbUser.id;
    }

    // 2. Verify session ownership — fails CLOSED. Previously this was
    // `if (userId)`, which meant a failure to resolve userId silently
    // skipped the ownership check entirely and returned messages for any
    // chat id. There is no legitimate case where userId is unresolvable
    // for an authenticated session, so treat that as denied, not skipped.
    if (!userId) {
      return NextResponse.json({ error: 'Unable to resolve user identity' }, { status: 401 });
    }

    const { data: chatSession, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (sessionErr || !chatSession) {
      console.warn(`[CHAT_MESSAGES] Session ${id} not found for user ${userId}`);
      return NextResponse.json({ error: 'Chat not found or access denied' }, { status: 404 });
    }

    // 3. Fetch messages
    const { data: messages, error: msgErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });

    if (msgErr) {
      throw new Error(msgErr.message);
    }

    interface ChatMessage {
      role: string;
      content: string;
      [key: string]: unknown;
    }

    const cleanedMessages = (messages as ChatMessage[]).map((m: ChatMessage) => {
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content);
          return { ...m, content: parsed.message || m.content };
        } catch {
          return m;
        }
      }
      return m;
    });

    return NextResponse.json(cleanedMessages);
  } catch (error: unknown) {
    // SECURITY: previously returned `stack` in the JSON response body —
    // exposing internal file paths/call structure to the client. Full
    // detail stays server-side in these console.error calls only.
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
