import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public list of active, server-defined token packages — no auth required to browse pricing. */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const { data, error } = await supabase
      .from('token_packages')
      .select('id, name, tokens, price_paise, currency')
      .eq('active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      packages: (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        tokens: p.tokens,
        priceInr: p.price_paise / 100,
        currency: p.currency,
      })),
    });
  } catch (err) {
    console.error('[payments/packages] error:', err);
    return NextResponse.json({ success: false, error: 'Unable to load packages' }, { status: 500 });
  }
}
