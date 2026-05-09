import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
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

    // 2. Verify session ownership (if userId available)
    if (userId) {
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

    const cleanedMessages = messages.map(m => {
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
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({ 
      success: false, 
      error: errorMessage, 
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
