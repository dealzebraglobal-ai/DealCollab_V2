'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import DashboardRow, { DashboardDeal } from '@/components/DashboardRow';
import { DashboardStatus } from '@/components/StatusButton';
import { DashboardSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import SendEOIModal from '@/components/SendEOIModal';
import { LayoutGrid, PlusCircle } from 'lucide-react';

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

  const handleRemoveEOI = async (eoiId: string | number) => {
    if (!confirm('Are you sure you want to remove this match? This will delete it permanently.')) return;
    try {
      const res = await fetch(`/api/eois?id=${eoiId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove EOI');
      mutateInbound();
      mutateOutbound();
    } catch (err: unknown) {
      console.error('🔥 handleRemoveEOI failed:', err);
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
              <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Deal Dashboard</h1>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-100 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Live</span>
              </div>
              {refreshing && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full animate-in fade-in slide-in-from-left-2 transition-all">
                  <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Updating...</span>
                </div>
              )}
            </div>
            <p className="text-gray-500 text-sm font-medium">Intelligent matchmaking and engagement tracking</p>
          </div>

          {data.length > 0 && (
            <button className="flex items-center gap-2 bg-[#1F2937] text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#F97316] transition-all shadow-sm">
              <PlusCircle size={18} />
              Create Deal
            </button>
          )}
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
              description="Our Intelligence Layer is scanning for opportunities. Create a new deal to accelerate the process."
              actionLabel="Create Deal"
              onAction={() => { }}
              icon={<LayoutGrid size={32} />}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <div className="w-2 h-2 bg-[#F97316] rounded-full animate-pulse" />
                <h2 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">
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
                    onRemove={() => handleRemoveEOI(item.id)}
                  />
                ))}
              </div>

              {/* View More Button */}
              <div className="mt-12 flex justify-center pb-20">
                <Link
                  href="/deal-log"
                  className="w-full py-4 flex items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 text-sm font-bold hover:bg-gray-100 hover:text-[#1F2937] transition-all duration-300"
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