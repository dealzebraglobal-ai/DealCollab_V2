// src/app/api/users/tokens/route.ts
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase init failed');

        const { data: user } = await supabase
            .from('users')
            .select('id, tokens')
            .eq('email', session.user.email)
            .single();

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Recent transactions (last 10)
        const { data: txns } = await supabase
            .from('token_transactions')
            .select('type, action, amount, balance_after, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        return NextResponse.json({
            balance: user.tokens ?? 0,
            tokenCostPerConnect: 50,
            canConnect: (user.tokens ?? 0) >= 50,
            recentTransactions: txns ?? [],
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}