import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { buildBlindCounterparty, type CounterpartyProposalRow } from '@/lib/M5_blindCard';
import { buildSynergyReview, type SynergySide } from '@/lib/M5_synergy';

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

function formatSize(min: number | string | null, max: number | string | null): string | null {
  if (!min && !max) return null;
  const minVal = min ? Number(min) : null;
  const maxVal = max ? Number(max) : null;
  if (minVal && maxVal && minVal !== maxVal) return `₹${minVal}–${maxVal} Cr`;
  return `₹${maxVal || minVal} Cr`;
}

// ── helpers for the blind counterparty + synergy payload ──
const numOf = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};
const industryOf = (m: unknown): string | null =>
  m && typeof (m as Record<string, unknown>).industry === 'string' ? ((m as Record<string, unknown>).industry as string) : null;
const toSide = (p: Record<string, unknown> | null | undefined): SynergySide => ({
  intent: String((p?.intent as string) ?? ''),
  sector: (p?.sectors as string[] | null)?.[0] ?? null,
  industry: industryOf(p?.metadata),
  geography: (p?.geographies as string[] | null)?.[0] ?? null,
  dealMin: numOf(p?.deal_size_min_cr),
  dealMax: numOf(p?.deal_size_max_cr),
  revMin: numOf(p?.revenue_min_cr),
  revMax: numOf(p?.revenue_max_cr),
});
// Label reflects the COUNTERPARTY's intent, disambiguated by the VIEWER's intent where the
// enum alone can't (BUY_SIDE reads as "Investor" when the viewer is fundraising, else "Proposed Buyer").
// DEBT cannot be split into borrower/lender — that direction is not stored in the schema.
const counterpartyRole = (cpIntent: string, viewerIntent: string): string => {
  switch (cpIntent) {
    case 'SELL_SIDE': return 'Proposed Target';
    case 'FUNDRAISING': return 'Proposed Investment';
    case 'BUY_SIDE': return viewerIntent === 'FUNDRAISING' ? 'Investor' : 'Proposed Buyer';
    case 'DEBT': return 'Debt Counterparty'; // borrower vs lender not in schema
    case 'STRATEGIC_PARTNERSHIP': return 'Proposed Partner';
    default: return 'Counterparty';
  }
};

const INTENT_SHORT: Record<string, string> = {
  SELL_SIDE: 'Sell-side', BUY_SIDE: 'Buy-side', FUNDRAISING: 'Fundraising',
  DEBT: 'Debt', STRATEGIC_PARTNERSHIP: 'Partnership',
};

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userErr || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const type = req.nextUrl.searchParams.get('type') || 'all'; // outbound, inbound, or all

    let query = supabase.from('eois').select(`
      id,
      deal_id,
      match_id,
      sender_id,
      receiver_id,
      status,
      created_at,
      sender:users!sender_id(name, email, phone, firm_name, role),
      receiver:users!receiver_id(name, email, phone, firm_name, role),
      deal:proposals!deal_id(id, user_id, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, revenue_min_cr, revenue_max_cr, deal_structure, special_conditions, quality_tier, normalised_text, summary_text, raw_text, metadata, contact_phone, advisor_name),
      match:proposal_matches!match_id(
        id,
        final_score,
        matched_proposal:proposals!matched_proposal_id(id, user_id, intent, sectors, geographies, deal_size_min_cr, deal_size_max_cr, revenue_min_cr, revenue_max_cr, deal_structure, special_conditions, quality_tier, normalised_text, summary_text, raw_text, metadata, contact_phone, advisor_name)
      )
    `);

    if (type === 'outbound') {
      query = query.eq('sender_id', dbUser.id);
    } else if (type === 'inbound') {
      query = query.eq('receiver_id', dbUser.id);
    } else {
      query = query.or(`sender_id.eq.${dbUser.id},receiver_id.eq.${dbUser.id}`);
    }

    const { data: eois, error: eoiErr } = await query.order('created_at', { ascending: false });
    if (eoiErr) throw eoiErr;

    // Filter sensitive info if not approved
    const safeEois = eois.map((eoi: any) => {
      const isSender = eoi.sender_id === dbUser.id;
      const isApproved = eoi.status === 'approved';

      // If we are sender, hide receiver identity unless approved
      if (isSender && !isApproved && eoi.receiver) {
        eoi.receiver = { name: "Confidential Counterparty" } as unknown as typeof eoi.receiver;
      }
      // If we are receiver, hide sender identity unless approved
      if (!isSender && !isApproved && eoi.sender) {
        eoi.sender = { name: "Confidential Counterparty" } as unknown as typeof eoi.sender;
      }

      // Extract match and matched proposal safely handling arrays
      const matchArray = eoi.match as unknown;
      const matchObj = Array.isArray(matchArray) ? (matchArray[0] as Record<string, unknown>) : (matchArray as Record<string, unknown>);
      const matchedProposalArray = matchObj?.matched_proposal;
      const matchedProposal = Array.isArray(matchedProposalArray) ? (matchedProposalArray[0] as Record<string, unknown>) : (matchedProposalArray as Record<string, unknown>);

      // Map proposals to deal format expected by frontend
      const rawDeal = isSender ? matchedProposal : (eoi.deal as unknown as Record<string, unknown>);
      const mappedDeal = rawDeal ? {
        title: rawDeal.normalised_text ? (String(rawDeal.normalised_text).slice(0, 60).trim() + (String(rawDeal.normalised_text).length > 60 ? '...' : '')) : 'Confidential Mandate',
        sector: Array.isArray(rawDeal.sectors) ? String(rawDeal.sectors[0]) : 'N/A',
        size: formatSize(rawDeal.deal_size_min_cr as number | null, rawDeal.deal_size_max_cr as number | null) || 'N/A'
      } : null;

      // Handle null/missing receiver details for seed proposals when we are the sender
      let mappedReceiver = eoi.receiver;
      if (isSender && !eoi.receiver) {
        mappedReceiver = {
          name: isApproved ? (String(matchedProposal?.advisor_name || "Confidential Advisor")) : "Confidential Counterparty",
          email: isApproved ? "unlocked@dealcollab.in" : "",
          phone: isApproved ? (String(matchedProposal?.contact_phone || "")) : "",
          firm_name: isApproved ? "DealCollab Network" : "",
          role: "Advisor"
        } as unknown as typeof eoi.receiver;
      }

      // ── Directional blind counterparty + deterministic synergy (additive; existing fields untouched) ──
      // deal_id = SENDER's proposal; matched_proposal = RECEIVER's proposal.
      const dealProp = eoi.deal as Record<string, unknown> | null;              // sender's proposal
      const cpRaw = (isSender ? matchedProposal : dealProp) as Record<string, unknown> | null;   // the OTHER side
      const ownRaw = (isSender ? dealProp : matchedProposal) as Record<string, unknown> | null;  // viewer's own
      const finalScore = Number((matchObj?.final_score as number) ?? 0);
      const counterparty = cpRaw
        ? buildBlindCounterparty(cpRaw as unknown as CounterpartyProposalRow, isApproved)
        : null;
      const synergy = ownRaw && cpRaw ? buildSynergyReview(toSide(ownRaw), toSide(cpRaw), finalScore) : null;
      const cpRole = counterpartyRole(String((cpRaw?.intent as string) ?? ''), String((ownRaw?.intent as string) ?? ''));

      // yourProposal: the VIEWER's own mandate, one-liner heading (intent · sector · industry · size)
      // so the user recognizes which of their deals this row is.
      const ownIntent = String((ownRaw?.intent as string) ?? '');
      const ownSector = (ownRaw?.sectors as string[] | null)?.[0] ?? null;
      const ownIndustry = industryOf(ownRaw?.metadata);
      const ownSize = formatSize(ownRaw?.deal_size_min_cr as number | null, ownRaw?.deal_size_max_cr as number | null);
      const yourProposal = ownRaw ? {
        title: [INTENT_SHORT[ownIntent] ?? ownIntent, ownSector, ownIndustry, ownSize].filter(Boolean).join(' · '),
        intent: ownIntent,
        sector: ownSector,
        size: ownSize,
      } : null;

      // counterpartyTitle: blind one-liner for the counterparty column — SAFE composed fields only
      // (intent · sector · industry · size). Never normalised_text/raw_text (those name the company).
      const cpIntentStr = String((cpRaw?.intent as string) ?? '');
      const cpSectorStr = (cpRaw?.sectors as string[] | null)?.[0] ?? null;
      const cpIndustryStr = industryOf(cpRaw?.metadata);
      const cpSizeStr = formatSize(cpRaw?.deal_size_min_cr as number | null, cpRaw?.deal_size_max_cr as number | null);
      const counterpartyTitle = cpRaw
        ? [INTENT_SHORT[cpIntentStr] ?? cpIntentStr, cpSectorStr, cpIndustryStr, cpSizeStr].filter(Boolean).join(' · ')
        : null;

      return {
        ...eoi,
        receiver: mappedReceiver,
        deal: mappedDeal,
        counterparty,
        synergy,
        counterpartyRole: cpRole,
        counterpartyTitle,
        yourProposal,
      };
    });

    return NextResponse.json(safeEois);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("🔥 GET /api/eois ERROR:", error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { dealId, matchId, receiverId } = body;

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: eoi, error: eoiErr } = await supabase
      .from('eois')
      .insert([{
        deal_id: dealId,
        match_id: matchId,
        sender_id: dbUser.id,
        receiver_id: receiverId,
        status: 'sent'
      }])
      .select()
      .single();

    if (eoiErr) throw eoiErr;

    // Trigger Notification for Receiver if exists
    if (receiverId) {
      await supabase.from('notifications').insert([{
        user_id: receiverId,
        type: 'EOI_RECEIVED',
        message: 'You have received a new Expression of Interest.',
        is_read: false
      }]);
    }

    return NextResponse.json(eoi);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("🔥 POST /api/eois ERROR:", error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, status } = body; // status: 'approved' | 'declined'

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Ensure user is the receiver
    const { data: existingEoi, error: fetchErr } = await supabase
      .from('eois')
      .select('receiver_id, sender_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existingEoi) throw new Error("EOI not found");
    if (existingEoi.receiver_id !== dbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // APPROVE: charge BOTH parties atomically via RPC (blocks if either is short).
    // The RPC also flips eois.status to 'approved' — do NOT double-update it here.
    if (status === 'approved') {
      const { data: result, error: rpcErr } = await supabase.rpc('approve_eoi_and_charge', {
        p_eoi_id: id,
        p_approver_user_id: dbUser.id,
        p_token_cost: 50,
      });
      if (rpcErr) {
        console.error('🔥 approve_eoi_and_charge RPC error:', rpcErr);
        return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 });
      }
      const r = Array.isArray(result) ? result[0] : result;
      if (!r?.success) {
        // Sender is the one short: notify the SENDER in-app (with a billing link), and tell the
        // receiver we've notified them. The receiver's own balance is fine, so no "buy tokens" for them.
        if (r?.error_code === 'SENDER_INSUFFICIENT') {
          await supabase.from('notifications').insert([{
            user_id: existingEoi.sender_id,
            type: 'EOI_APPROVAL_BLOCKED',
            message: "Someone tried to approve your EOI, but you don't have enough tokens. Please top up to complete the connection.",
            is_read: false,
            metadata: { link: '/profile/billing' },
          }]);
          return NextResponse.json({
            success: false,
            errorCode: 'SENDER_INSUFFICIENT',
            message: "Cannot approve because the sender has insufficient tokens. We've notified them.",
          }, { status: 409 });
        }
        const http =
          r?.error_code === 'INSUFFICIENT_TOKENS' ? 402 :
            r?.error_code === 'NOT_RECEIVER' ? 403 :
              r?.error_code === 'EOI_NOT_FOUND' ? 404 : 400;
        return NextResponse.json({
          success: false,
          errorCode: r?.error_code,
          message: r?.message,
          senderBalance: r?.sender_balance,
          receiverBalance: r?.receiver_balance,
        }, { status: http });
      }

      await supabase.from('notifications').insert([{
        user_id: existingEoi.sender_id,
        type: 'EOI_APPROVED',
        message: 'Your Expression of Interest was approved.',
        is_read: false,   // boolean column
      }]);

      return NextResponse.json({
        success: true,
        status: 'approved',
        errorCode: r.error_code,          // 'OK' or 'ALREADY_APPROVED'
        senderBalance: r.sender_balance,
        receiverBalance: r.receiver_balance,
      });
    }

    // DECLINE (or any non-approve status): update status only, no charge.
    const { data: eoi, error: eoiErr } = await supabase
      .from('eois')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (eoiErr) throw eoiErr;

    await supabase.from('notifications').insert([{
      user_id: existingEoi.sender_id,
      type: `EOI_${String(status).toUpperCase()}`,
      message: `Your Expression of Interest was ${status}.`,
      is_read: false,   // boolean column
    }]);

    return NextResponse.json(eoi);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("🔥 PATCH /api/eois ERROR:", error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id param' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Fetch EOI to verify ownership
    const { data: existingEoi, error: fetchErr } = await supabase
      .from('eois')
      .select('sender_id, receiver_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existingEoi) {
      return NextResponse.json({ error: 'EOI not found' }, { status: 404 });
    }

    if (existingEoi.sender_id !== dbUser.id && existingEoi.receiver_id !== dbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete the EOI
    const { error: deleteErr } = await supabase
      .from('eois')
      .delete()
      .eq('id', id);

    if (deleteErr) throw deleteErr;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("🔥 DELETE /api/eois ERROR:", error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}