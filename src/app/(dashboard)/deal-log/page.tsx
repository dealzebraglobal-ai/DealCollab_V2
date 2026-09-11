'use client';
import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import DealLogCard from '@/components/DealLogCard';
import { DealLogSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import { DealStatus } from '@/components/StatusBadge';
import { Match } from '@/components/MatchWindow';
import BulkMandatesTab from '@/components/BulkMandatesTab';
import { BulkMandate } from '@/components/BulkMandateCard';
import BulkUploadModal from '@/components/BulkUploadModal';
import { Search, X, Layers, MessageSquare, MessageCircle, UploadCloud } from 'lucide-react';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !Array.isArray(data)) {
    const msg = (data as { error?: string })?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
};

interface DBMatch {
  id: string;
  score: string;
  similarity: string;
  reason?: string;
  counterparty?: {
    sector: string;
    geography: string;
    intent: string;
    raw_text?: string | null;
    normalised_text?: string | null;
    summary_text?: string | null;
    mandate_summary?: string | null;
  };
}

interface DBDeal {
  id: string;
  intent?: string;
  sectors?: string[];
  geographies?: string[];
  deal_size_min_cr?: number | null;
  deal_size_max_cr?: number | null;
  matches: DBMatch[];
  raw_text?: string | null;
  normalised_text?: string | null;
  summary_text?: string | null;
  metadata?: { mandate_summary?: string; [key: string]: unknown };
  source?: string;
  created_at?: string;
}

interface Deal {
  id: string | number;
  deal: string;
  sector: string;
  region: string;
  status: DealStatus;
  summary: string;
  matches: Match[];
  isNew?: boolean;
  isConnectionActive?: boolean;
  source?: string;
  intent?: string;
  createdAt?: string;
  dealSizeMinCr?: number | null;
  dealSizeMaxCr?: number | null;
  structure?: string | null;
  metadata?: Record<string, unknown> | null;
}

const INTENT_LABELS: Record<string, string> = {
  SELL_SIDE: 'Sell Side',
  BUY_SIDE: 'Buy Side',
  FUNDRAISING: 'Fundraising',
  DEBT: 'Debt Financing',
  STRATEGIC_PARTNERSHIP: 'Strategic Partnership',
};

function isWhatsAppSource(source?: string | null): boolean {
  if (!source) return false;
  const s = source.toUpperCase();
  return s.includes('WHATSAPP') || s.includes('WAPPBIZ');
}

function isBulkSource(source?: string | null): boolean {
  if (!source) return false;
  return source.toUpperCase().includes('BULK');
}

function formatSectorLabel(sector?: string | null): string {
  if (!sector) return 'Precision Manufacturing';
  return sector
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function DealLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: rawDeals, error, mutate, isValidating } = useSWR('/api/deals', fetcher, {
    refreshInterval: 15000, // Re-fetch every 15s for realtime feel
  });

  const loading = !rawDeals && !error;
  const refreshing = isValidating && !!rawDeals;

  const [expandedDealId, setExpandedDealId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Searching Match' | 'Matched'>('All');
  const [activeTab, setActiveTab] = useState<'chat' | 'whatsapp' | 'bulk'>('chat');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Sync tab from URL query param on mount or update (e.g. from WhatsApp magic link)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'whatsapp' || tabParam === 'bulk' || tabParam === 'chat') {
      const timeoutId = setTimeout(() => setActiveTab(tabParam), 0);
      return () => clearTimeout(timeoutId);
    }
  }, [searchParams]);

  const deals: Deal[] = (Array.isArray(rawDeals) ? rawDeals : []).map((dbDeal: DBDeal) => {
    const intentName = dbDeal.intent ? (INTENT_LABELS[dbDeal.intent] || dbDeal.intent) : 'Sell Side';
    const sectorName = formatSectorLabel(dbDeal.sectors?.[0]);
    return {
      id: dbDeal.id,
      deal: `${intentName}: ${sectorName}`,
      sector: sectorName,
      region: dbDeal.geographies?.[0] || 'Pune, Maharashtra',
      summary: dbDeal.summary_text || dbDeal.raw_text || 'Deal summary unavailable',
      status: dbDeal.matches && dbDeal.matches.length > 0 ? "Matched" : "Searching Match",
      source: dbDeal.source,
      intent: dbDeal.intent,
      createdAt: dbDeal.created_at,
      dealSizeMinCr: dbDeal.deal_size_min_cr ?? null,
      dealSizeMaxCr: dbDeal.deal_size_max_cr ?? null,
      structure: (dbDeal.metadata as any)?.structure || (dbDeal.metadata as any)?.deal_structure || null,
      metadata: dbDeal.metadata,
      matches: (dbDeal.matches || []).map((m: DBMatch, i: number) => ({
        id: m.id,
        rank: i + 1,
        label: `P${i + 1}`,
        proposalId: dbDeal.id,
        finalScore: m.score ? parseFloat(m.score) : 0,
        confidenceScore: m.similarity ? parseFloat(m.similarity) * 100 : 0,
        scores: {
          intent: m.score ? parseFloat(m.score) : 0,
          industry: m.score ? parseFloat(m.score) : 0,
          financial: m.score ? parseFloat(m.score) : 0,
          niche: 0,
          geography: 0,
          similarity: m.similarity ? parseFloat(m.similarity) * 100 : 0,
        },
        matchReason: m.reason || 'AI alignment detected.',
        counterparty: {
          sector: m.counterparty?.sector || 'Unknown',
          subSector: null,
          geography: m.counterparty?.geography || 'Global',
          intent: m.counterparty?.intent || 'UNKNOWN',
          structure: null,
          summary: m.counterparty?.summary_text || m.counterparty?.raw_text || 'Deal summary unavailable',
        },
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      }))
    };
  });

  // Split deals by source
  const webDeals = deals.filter(d => !isBulkSource(d.source) && !isWhatsAppSource(d.source));
  const whatsappDeals = deals.filter(d => isWhatsAppSource(d.source));
  const bulkDeals = deals.filter(d => isBulkSource(d.source));
  const chatDeals = activeTab === 'whatsapp' ? whatsappDeals : webDeals;

  const bulkMandates: BulkMandate[] = bulkDeals.map(d => ({
    id: String(d.id),
    title: d.deal,
    summary: d.summary,
    industry: d.sector,
    structure: d.intent ? (INTENT_LABELS[d.intent] || d.intent) : '',
    createdAt: d.createdAt || new Date().toISOString(),
    status: d.status === 'Matched' ? 'Matched' : 'Searching Match',
    matches: d.matches,
  }));

  const handleDelete = async (id: string | number) => {
    if (Array.isArray(rawDeals)) {
      mutate(rawDeals.filter((d: DBDeal) => d.id !== id), false);
    }
    if (expandedDealId === id) setExpandedDealId(null);
  };

  const handleToggleExpand = (id: string | number) => {
    setExpandedDealId(prev => prev === id ? null : id);
  };

  const handleViewMatch = (match: Match) => {
    router.push(`/deal-log/${match.id}`);
  };

  const filteredDeals = chatDeals.filter(deal => {
    const searchStr = searchQuery.toLowerCase();
    const matchesSearch =
      deal.deal.toLowerCase().includes(searchStr) ||
      deal.sector.toLowerCase().includes(searchStr) ||
      deal.region.toLowerCase().includes(searchStr) ||
      (deal.summary && deal.summary.toLowerCase().includes(searchStr));
    const matchesStatus =
      statusFilter === 'All'
        ? true
        : statusFilter === 'Matched'
          ? deal.status === 'Matched'
          : deal.status === 'Searching Match';
    return matchesSearch && matchesStatus;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
  };

  return (
    <div className="relative flex-1 flex flex-col w-full bg-white h-full">
      <div className="flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 overflow-y-auto">

        {/* Top Header Bar */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1F2937] tracking-tight">Deal Log</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#E8F8F0] border border-[#DCFCE7] rounded-full">
              <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full" />
              <span className="text-[11px] font-bold text-[#16A34A] uppercase tracking-wider">LIVE</span>
            </div>
            {refreshing && (
              <div className="flex items-center gap-2 px-2.5 py-0.5 bg-gray-50 rounded-full animate-in fade-in transition-all">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-[#FF6A00] rounded-full animate-spin" />
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-gray-500 text-sm font-normal">Real-time status of your active proposals and match pipeline</p>
        </div>

        {/* Mandate Source Tabs */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-[#F3F4F6] p-1.5 border border-[#E5E7EB] rounded-2xl w-fit max-w-full mb-8 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              activeTab === 'chat'
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <MessageSquare size={15} className={activeTab === 'chat' ? 'text-[#EA580C]' : 'text-gray-400'} />
            <span>Chat Mandates</span>
            <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold transition-all ${
              activeTab === 'chat' ? 'bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA]' : 'bg-gray-200 text-gray-600'
            }`}>
              {webDeals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              activeTab === 'whatsapp'
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <MessageCircle size={15} className={activeTab === 'whatsapp' ? 'text-[#EA580C]' : 'text-gray-400'} />
            <span>WhatsApp Mandates</span>
            <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold transition-all ${
              activeTab === 'whatsapp' ? 'bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA]' : 'bg-gray-200 text-gray-600'
            }`}>
              {whatsappDeals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              activeTab === 'bulk'
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <UploadCloud size={15} className={activeTab === 'bulk' ? 'text-[#EA580C]' : 'text-gray-400'} />
            <span>Bulk Uploaded Mandates</span>
            <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold transition-all ${
              activeTab === 'bulk' ? 'bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA]' : 'bg-gray-200 text-gray-600'
            }`}>
              {bulkDeals.length}
            </span>
          </button>
        </div>

        {/* Global Toolbar — Search + Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          {/* Search Bar */}
          <div data-onboarding-target="search" className="relative group w-full sm:w-96">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#EA580C] transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by sector, keyword, geography..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm font-normal text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-[#EA580C]/50 focus:ring-1 focus:ring-[#EA580C]/20 transition-all outline-none shadow-2xs"
            />
          </div>

          {/* Status Filter Segmented Control */}
          <div className="flex items-center gap-1 bg-[#F9FAFB] p-1 border border-gray-200 rounded-xl shadow-2xs">
            {(['All', 'Searching Match', 'Matched'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === status
                    ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                {status === 'Matched' ? 'View Matches' : status === 'All' ? 'All' : 'Searching'}
              </button>
            ))}
          </div>

          {/* Clear Button */}
          {(searchQuery || statusFilter !== 'All') && (
            <button
              onClick={clearFilters}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Clear filters"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="w-full">
          {activeTab === 'bulk' ? (
            <BulkMandatesTab
              deals={bulkMandates}
              onUploadClick={() => setIsUploadModalOpen(true)}
              onViewMatch={handleViewMatch}
              onMandatesUpdated={() => mutate()}
            />
          ) : loading ? (
            <DealLogSkeleton />
          ) : error ? (
            <ErrorState onRetry={() => mutate()} />
          ) : chatDeals.length === 0 ? (
            <EmptyState
              title="Your Deal Log is empty"
              description="You haven't added any deals yet. Start by defining your first acquisition or sell-side proposal."
              icon={<Layers size={32} />}
            />
          ) : filteredDeals.length === 0 ? (
            <EmptyState
              title="No matches for current filters"
              description="Adjust your search or status filters to view different deal entries."
              actionLabel="Reset Filters"
              onAction={clearFilters}
              icon={<Search size={32} />}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {filteredDeals.map(deal => (
                <DealLogCard
                  key={deal.id}
                  deal={deal}
                  isExpanded={expandedDealId === deal.id}
                  onToggle={() => handleToggleExpand(deal.id)}
                  onDelete={() => handleDelete(deal.id)}
                  onViewMatch={handleViewMatch}
                />
              ))}
            </div>
          )}
        </div>

        <div className="h-20 shrink-0" />
      </div>

      <BulkUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploaded={() => mutate()}
      />
    </div>
  );
}
