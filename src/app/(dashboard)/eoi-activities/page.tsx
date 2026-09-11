'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import DashboardRow, { DashboardDeal } from '@/components/DashboardRow';
import { DashboardStatus } from '@/components/StatusButton';
import { DashboardSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import SendEOIModal from '@/components/SendEOIModal';
import { LayoutGrid, ChevronLeft, ChevronRight, Shield } from 'lucide-react';

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

type TabType = 'all' | 'received' | 'sent' | 'connected';

const PAGE_SIZE = 5;

export default function DealDashboardPage() {
  const { data: inboundData, error: inboundError, mutate: mutateInbound, isValidating: inboundVal } = useSWR('/api/eois?type=inbound', fetcher, { refreshInterval: 15000 });
  const { data: outboundData, error: outboundError, mutate: mutateOutbound, isValidating: outboundVal } = useSWR('/api/eois?type=outbound', fetcher, { refreshInterval: 15000 });

  const loading = !inboundData && !inboundError;
  const refreshing = (inboundVal && !!inboundData) || (outboundVal && !!outboundData);
  const error = inboundError || outboundError;

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

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

    const own = eoi.yourProposal;
    const dealTitle = own?.title || eoi.deal?.title || 'Active Deal';
    const dealDesc = own
      ? `Sector: ${own.sector || 'N/A'} · Size: ${own.size || 'N/A'}`
      : `Sector: ${eoi.deal?.sector || 'N/A'}, Size: ${eoi.deal?.size || 'N/A'}`;

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
    };
  };

  const incomingEOIs: DashboardDeal[] = (inboundData || []).map((e: EOIResponse) => formatEoi(e, true));
  const myProposals: DashboardDeal[] = (outboundData || []).map((e: EOIResponse) => formatEoi(e, false));
  const data = [...incomingEOIs, ...myProposals].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  // Tab counts
  const allCount = data.length;
  const receivedCount = incomingEOIs.filter(e => e.status !== 'Approved').length;
  const sentCount = myProposals.filter(e => e.status !== 'Approved').length;
  const connectedCount = data.filter(e => e.status === 'Approved').length;

  // Filtered dataset according to active tab
  const filteredData = data.filter(item => {
    if (activeTab === 'received') return item.isIncoming && item.status !== 'Approved';
    if (activeTab === 'sent') return !item.isIncoming && item.status !== 'Approved';
    if (activeTab === 'connected') return item.status === 'Approved';
    return true;
  });

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedData = filteredData.slice(startIndex, startIndex + PAGE_SIZE);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

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
    <div className="relative flex-1 flex flex-col w-full bg-[#FAFAFA] min-h-full">
      <div className="flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 relative overflow-y-auto">

        {/* Top Bar Section */}
        <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto w-full">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1F2937] tracking-tight">EOI Activities</h1>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#E5E7EB] rounded-full shadow-2xs">
                <div className="w-2 h-2 bg-[#16A34A] rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider">LIVE</span>
              </div>
              {refreshing && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#E5E7EB] rounded-full animate-in fade-in slide-in-from-left-2 transition-all">
                  <div className="w-2.5 h-2.5 border-2 border-gray-300 border-t-[#FF6A00] rounded-full animate-spin" />
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">UPDATING...</span>
                </div>
              )}
            </div>
            <p className="text-gray-500 text-sm font-normal">
              Track your EOI interactions, mutual interest, and connected parties seamlessly.
            </p>
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
              {/* Summary Counter & Filter Tabs Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
                {/* Left Active Deals Summary */}
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#FF6A00] rounded-full animate-pulse" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#1F2937]">
                    ACTIVE DEALS ({allCount}) <span className="text-gray-400">·</span> <span className="text-[#FF6A00]">{receivedCount} RECEIVED</span>
                  </h2>
                </div>

                {/* Right Filter Tabs */}
                <div className="flex items-center gap-1 bg-[#F3F4F6] p-1 rounded-xl border border-[#E5E7EB] self-start sm:self-auto text-xs">
                  <button
                    onClick={() => handleTabChange('all')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      activeTab === 'all'
                        ? 'bg-white text-[#1F2937] shadow-2xs font-bold'
                        : 'text-gray-600 hover:text-[#1F2937]'
                    }`}
                  >
                    All ({allCount})
                  </button>

                  <button
                    onClick={() => handleTabChange('received')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      activeTab === 'received'
                        ? 'bg-white text-[#1F2937] shadow-2xs font-bold'
                        : 'text-gray-600 hover:text-[#1F2937]'
                    }`}
                  >
                    Received ({receivedCount})
                  </button>

                  <button
                    onClick={() => handleTabChange('sent')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      activeTab === 'sent'
                        ? 'bg-white text-[#1F2937] shadow-2xs font-bold'
                        : 'text-gray-600 hover:text-[#1F2937]'
                    }`}
                  >
                    Sent ({sentCount})
                  </button>

                  <button
                    onClick={() => handleTabChange('connected')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      activeTab === 'connected'
                        ? 'bg-white text-[#1F2937] shadow-2xs font-bold'
                        : 'text-gray-600 hover:text-[#1F2937]'
                    }`}
                  >
                    Connected ({connectedCount})
                  </button>
                </div>
              </div>

              {/* Activity Cards List */}
              {paginatedData.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-2xl border border-[#E5E7EB]">
                  <p className="text-sm font-medium text-gray-500">No active deals found in this category.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {paginatedData.map(item => (
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
              )}

              {/* Pagination Controls */}
              {filteredData.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-12 border-t border-gray-200">
                  <p className="text-xs text-gray-500 font-normal">
                    Showing <strong className="font-semibold text-gray-700">{filteredData.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + PAGE_SIZE, filteredData.length)}</strong> of <strong className="font-semibold text-gray-700">{filteredData.length}</strong> active deals
                  </p>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-all"
                    >
                      Previous
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                          currentPage === page
                            ? 'bg-[#FF6A00] text-white shadow-sm'
                            : 'bg-white border border-[#E5E7EB] text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Enterprise Security Footer Notice */}
        <div className="mt-auto py-8 text-center text-[11px] text-gray-400 font-normal flex items-center justify-center gap-1.5">
          <Shield size={13} className="text-gray-400 shrink-0" />
          <span>Protected by Enterprise Deal Encryption · All institutional counterparties vetted via standard KYC/AML protocol</span>
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