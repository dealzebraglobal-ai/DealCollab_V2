import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

export async function GET() {
  console.log("ENV CHECK (HISTORY):", !!process.env.GROQ_API_KEY);
  
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    // 1. Fetch DB ID by email (Mismatch fix)
    const { data: dbUser, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.user.email)
      .single();

    if (userErr || !dbUser) {
      console.warn("User record missing for history fetch:", session.user.email);
      return NextResponse.json([]);
    }

    const userId = dbUser.id;
    console.log("userId:", userId);

    // 2. Fetch sessions using correct userId
    const { data: history, error: historyErr } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (historyErr) {
      console.error("Supabase history error:", historyErr);
      throw new Error(historyErr.message);
    }

    console.log("chats:", history);

    return NextResponse.json(history.map(s => ({
      id: s.id,
      title: s.title,
      created_at: s.created_at
    })));

  } catch (error: unknown) {
    // SECURITY: stack traces must never reach the client — kept server-side only.
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
