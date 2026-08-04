// src/app/api/matches/connect/route.ts
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { hasAcceptedTerms } from '@/lib/consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_COST = 50;

interface ConnectBody {
    proposalId: string;          // current user's proposal
    matchedProposalId: string;   // the counterparty proposal
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = (await req.json()) as ConnectBody;
        if (!body.proposalId || !body.matchedProposalId) {
            return NextResponse.json(
                { error: 'proposalId and matchedProposalId required' },
                { status: 400 }
            );
        }

        if (body.proposalId === body.matchedProposalId) {
            return NextResponse.json(
                { error: 'Cannot connect to your own proposal' },
                { status: 400 }
            );
        }

        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase init failed');

        // Resolve user
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('email', session.user.email)
            .single();

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!(await hasAcceptedTerms(user.id))) {
            return NextResponse.json(
                { error: 'consent_required',
                  message: 'Please complete your profile' },
                { status: 403 },
            );
        }

        // Atomic RPC: token check + deduct + ledger + connection record
        const { data: result, error: rpcErr } = await supabase.rpc('connect_match', {
            p_user_id: user.id,
            p_proposal_id: body.proposalId,
            p_matched_proposal_id: body.matchedProposalId,
            p_token_cost: TOKEN_COST,
        });

        if (rpcErr) {
            console.error('[CONNECT] RPC error:', rpcErr);
            return NextResponse.json({ error: rpcErr.message }, { status: 500 });
        }

        if (!result || result.length === 0) {
            return NextResponse.json({ error: 'No response from RPC' }, { status: 500 });
        }

        const r = result[0];

        if (!r.success) {
            const status = r.error_code === 'INSUFFICIENT_TOKENS' ? 402
                : r.error_code === 'NOT_OWNER' ? 403
                    : r.error_code === 'USER_NOT_FOUND' ? 404
                        : 400;

            return NextResponse.json({
                success: false,
                errorCode: r.error_code,
                message: r.message,
                newBalance: r.new_balance,
                tokensRequired: TOKEN_COST,
            }, { status });
        }

        // Success — sync with eois table so it appears on the Deal Dashboard
        try {
            const { data: matchRow } = await supabase
                .from('proposal_matches')
                .select('id')
                .eq('proposal_id', body.proposalId)
                .eq('matched_proposal_id', body.matchedProposalId)
                .maybeSingle();

            if (matchRow) {
                const { data: existingEoi } = await supabase
                    .from('eois')
                    .select('id')
                    .eq('match_id', matchRow.id)
                    .maybeSingle();

                if (!existingEoi) {
                    const { data: cpProp } = await supabase
                        .from('proposals')
                        .select('user_id')
                        .eq('id', body.matchedProposalId)
                        .maybeSingle();

                    await supabase
                        .from('eois')
                        .insert([{
                            deal_id: body.proposalId,
                            match_id: matchRow.id,
                            sender_id: user.id,
                            receiver_id: cpProp?.user_id || null,
                            status: 'approved'
                        }]);
                }
            }
        } catch (syncErr) {
            console.error('[CONNECT] Failed to sync EOI:', syncErr);
        }

        // Success — reveal counterparty contact
        return NextResponse.json({
            success: true,
            errorCode: r.error_code, // 'OK' or 'ALREADY_CONNECTED'
            message: r.message,
            connectionId: r.connection_id,
            newBalance: r.new_balance,
            tokensSpent: r.error_code === 'ALREADY_CONNECTED' ? 0 : TOKEN_COST,
            counterparty: {
                phone: r.counterparty_phone,
                advisor: r.counterparty_advisor,
            },
        });
    } catch (err) {
        console.error('[CONNECT] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}