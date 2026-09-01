import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The user's own purchase history only — scoped by the authenticated user's id, never a client-supplied id. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (!dbUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('payment_transactions')
      .select('id, package_id, amount_paise, original_amount_paise, discount_amount_paise, currency, token_quantity, status, created_at')
      .eq('user_id', dbUser.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      history: (data || []).map((row) => ({
        id: row.id,
        packageId: row.package_id,
        amountInr: row.amount_paise / 100,
        originalAmountInr: row.original_amount_paise / 100,
        discountAmountInr: row.discount_amount_paise / 100,
        currency: row.currency,
        tokenQuantity: row.token_quantity,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    console.error('[payments/history] error:', err);
    return NextResponse.json({ success: false, error: 'Unable to load purchase history' }, { status: 500 });
  }
}
