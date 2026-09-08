'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import DashboardRow, { DashboardDeal } from '@/components/DashboardRow';
import { DashboardStatus } from '@/components/StatusButton';
import { DashboardSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import SendEOIModal from '@/components/SendEOIModal';
import { LayoutGrid } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface EOIResponse {
  id: string | number;
  status: string;
  created_at?: string;
  deal?: { title?: string; sector?: string; size?: string };
  yourProposal?: { title?: string; sector?: string; size?: string; intent?: string } | null;
  counterpartyRole?: string;
  counterpartyTitle?: string | null;
  sender?: { name?: string; role?: string; firm_name?: string };
  receiver?: { name?: string; role?: string; firm_name?: string };
}

export default function DealDashboardPage() {
  const { data: inboundData, error: inboundError, mutate: mutateInbound, isValidating: inboundVal } = useSWR('/api/eois?type=inbound', fetcher, { refreshInterval: 15000 });
  const { data: outboundData, error: outboundError, mutate: mutateOutbound, isValidating: outboundVal } = useSWR('/api/eois?type=outbound', fetcher, { refreshInterval: 15000 });

  const loading = !inboundData && !inboundError;
  const refreshing = (inboundVal && !!inboundData) || (outboundVal && !!outboundData);
  const error = inboundError || outboundError;

  const [eoiModal, setEoiModal] = useState<{ isOpen: boolean, deal: DashboardDeal | null }>({
    isOpen: false,
    deal: null
  });

  // Map API eois to UI components
  const formatEoi = (eoi: EOIResponse, isIncoming: boolean): DashboardDeal => {
    let mappedStatus = eoi.status;
    if (isIncoming && eoi.status === 'sent') mappedStatus = 'EOI Received';
    if (!isIncoming && eoi.status === 'sent') mappedStatus = 'EOI Sent — Awaiting Approval';
    if (eoi.status === 'approved') mappedStatus = 'Approved';
    if (eoi.status === 'declined') mappedStatus = 'Declined';

    // YOUR OFFER = the viewer's OWN proposal (directional, from the endpoint). The old code
    // used eoi.deal, which is the COUNTERPARTY's proposal — that was the "shows wrong deal" bug.
    const own = eoi.yourProposal;
    const dealTitle = own?.title || eoi.deal?.title || 'Active Deal';
    const dealDesc = own
      ? `Sector: ${own.sector || 'N/A'} · Size: ${own.size || 'N/A'}`
      : `Sector: ${eoi.deal?.sector || 'N/A'}, Size: ${eoi.deal?.size || 'N/A'}`;

    // Counterparty column: blind name + role. No firm_name (identity) — use the role label.
    // Counterparty column: blind safe descriptor (intent · sector · industry · size). The
    // short role label ("Proposed Target" etc.) is rendered separately by DashboardRow.
    const matchDesc = eoi.counterpartyTitle || eoi.counterpartyRole || (isIncoming ? 'Counterparty' : 'AI Match');

    return {
      id: eoi.id,
      deal: dealTitle,
      dealDesc,
      match: isIncoming ? eoi.sender?.name || '' : eoi.receiver?.name || '',
      matchDesc,
      status: mappedStatus as DashboardStatus,
      isIncoming,
      counterpartyRole: eoi.counterpartyRole,
      createdAt: eoi.created_at,
      raw: eoi
    }
  };

  const incomingEOIs: DashboardDeal[] = (inboundData || []).map((e: EOIResponse) => formatEoi(e, true));
  const myProposals: DashboardDeal[] = (outboundData || []).map((e: EOIResponse) => formatEoi(e, false));
  const data = [...incomingEOIs, ...myProposals].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const [rowErrors, setRowErrors] = useState<Record<string, { message: string; canBuy: boolean }>>({});

  const handleApproveEOI = async (eoiId: string | number) => {
    const key = String(eoiId);
    try {
      const res = await fetch('/api/eois', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eoiId, status: 'approved' })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.errorCode === 'SENDER_INSUFFICIENT') {
          // The SENDER is short — buying tokens won't help the receiver. Show message only.
          setRowErrors(prev => ({
            ...prev, [key]: {
              message: body.message || "Cannot approve because the sender has insufficient tokens. We've notified them.",
              canBuy: false,
            }
          }));
        } else if (body.errorCode === 'INSUFFICIENT_TOKENS' || res.status === 402) {
          setRowErrors(prev => ({
            ...prev, [key]: {
              message: body.message || 'You need 50 tokens to approve and connect.',
              canBuy: true,
            }
          }));
        } else {
          setRowErrors(prev => ({
            ...prev, [key]: {
              message: body.message || body.error || 'Failed to approve. Please try again.',
              canBuy: false,
            }
          }));
        }
        return;
      }
      setRowErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
      mutateInbound();
      mutateOutbound();
    } catch (err: unknown) {
      console.error('🔥 handleApproveEOI failed:', err);
      setRowErrors(prev => ({ ...prev, [key]: { message: 'Network error. Please try again.', canBuy: false } }));
    }
  };

  const handleDeclineEOI = async (eoiId: string | number) => {
    try {
      const res = await fetch('/api/eois', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eoiId, status: 'declined' })
      });
      if (!res.ok) throw new Error('Failed to decline EOI');
      mutateInbound();
      mutateOutbound();
    } catch (err: unknown) {
      console.error('🔥 handleDeclineEOI failed:', err);
    }
  };

  const handleEOIRequest = (item: DashboardDeal) => {
    setEoiModal({ isOpen: true, deal: item });
  };

  const handleEOISuccess = () => {
    mutateOutbound();
    mutateInbound();
  };

  return (
    <div className="relative flex-1 flex flex-col w-full bg-white h-full">
      <div className="flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 relative overflow-y-auto">

        {/* Top Bar Section */}
        <div className="flex justify-between items-center mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1F2937] tracking-tight">EOI Activities</h1>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F3F4F6] border border-[#E5E7EB] rounded-full">
                <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-pulse" />
                <span className="text-[10px] font-medium text-[#16A34A] uppercase tracking-wider">Live</span>
              </div>
              {refreshing && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full animate-in fade-in slide-in-from-left-2 transition-all">
                  <div className="w-3 h-3 border-2 border-gray-300 border-t-[#FF6A00] rounded-full animate-spin" />
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Updating...</span>
                </div>
              )}
            </div>
            <p className="text-black text-sm font-normal">Track your EOI interactions, mutual interest, and connected parties</p>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full">

          {loading ? (
            <DashboardSkeleton />
          ) : error ? (
            <ErrorState onRetry={() => { mutateInbound(); mutateOutbound(); }} />
          ) : data.length === 0 ? (
            <EmptyState
              title="No matches found yet"
              description="Our Intelligence Layer is continuously scanning for opportunities. Share your requirements with the AI chatbot or upload documents to accelerate matches."
              icon={<LayoutGrid size={32} />}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <div className="w-2 h-2 bg-[#FF6A00] rounded-full animate-pulse" />
                <h2 className="text-xs font-medium uppercase tracking-wider text-[#1F2937]">
                  Active Deals ({data.length}) · {incomingEOIs.length} incoming
                </h2>
              </div>
              <div className="flex flex-col gap-6">
                {data.map(item => (
                  <DashboardRow
                    key={item.id}
                    item={item}
                    error={rowErrors[String(item.id)]}
                    onEOIClick={() => handleEOIRequest(item)}
                    onApprove={() => handleApproveEOI(item.id)}
                    onDecline={() => handleDeclineEOI(item.id)}
                  />
                ))}
              </div>

              {/* View More Button */}
              <div className="mt-12 flex justify-center pb-20">
                <Link
                  href="/deal-log"
                  className="w-full py-4 flex items-center justify-center bg-white border border-[#E5E7EB] rounded-2xl text-[#6B7280] text-sm font-medium hover:bg-[#F9FAFB] hover:border-black transition-all duration-200"
                >
                  View More Active Deals
                </Link>
              </div>
            </div>
          )}
        </div>

        <SendEOIModal
          isOpen={eoiModal.isOpen}
          onClose={() => setEoiModal({ isOpen: false, deal: null })}
          dealName={eoiModal.deal?.deal || ''}
          onSuccess={handleEOISuccess}
        />
      </div>
    </div>
  );
}