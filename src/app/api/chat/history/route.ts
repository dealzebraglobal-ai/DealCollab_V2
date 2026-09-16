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
    // WEB/WHATSAPP separation: a user can have the same users.id across both
    // channels (e.g. after linking their WhatsApp phone to their web
    // account), so filtering by user_id alone also returns their WhatsApp-
    // originated sessions — those must never appear in this web sidebar
    // list. WhatsApp sessions are reliably identifiable two ways in the
    // existing schema (src/db/schema.ts's chatSessions table):
    //   - whatsapp_phone_number: only ever set by the WhatsApp pipeline
    //     (chatPipeline.ts's runChatTurn only populates it when
    //     channel === 'WHATSAPP'; the web route never sets it) — always
    //     NULL for a web session, so this alone is a sufficient filter.
    //   - source: also channel-tagged, but inconsistently cased across the
    //     two call sites ('web' lowercase from src/app/api/chat/route.ts's
    //     `source.toLowerCase()` vs 'WHATSAPP'/'WHATSAPP-WAPPBIZ' uppercase
    //     from chatPipeline.ts/chatbot.ts) — matched case-insensitively as a
    //     defense-in-depth belt-and-suspenders, not the primary filter.
    // Only this listing query is touched — /api/chat/[id] (load a specific
    // chat by id) and the WhatsApp pipeline itself are untouched, so this is
    // purely a presentation/retrieval-layer change.
    const { data: history, error: historyErr } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .is("whatsapp_phone_number", null)
      .not("source", "ilike", "whatsapp%")
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
