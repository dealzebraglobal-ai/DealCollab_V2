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
  if (!sector) return 'Unknown Sector';
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
    const intentName = dbDeal.intent ? (INTENT_LABELS[dbDeal.intent] || dbDeal.intent) : 'Deal';
    const sectorName = formatSectorLabel(dbDeal.sectors?.[0]);
    return {
      id: dbDeal.id,
      deal: `${intentName}: ${sectorName}`,
      sector: sectorName,
      region: dbDeal.geographies?.[0] || 'Global',
      summary: dbDeal.summary_text || dbDeal.raw_text || 'Deal summary unavailable',
      status: dbDeal.matches && dbDeal.matches.length > 0 ? "Matched" : "Searching Match",
      source: dbDeal.source,
      intent: dbDeal.intent,
      createdAt: dbDeal.created_at,
      matches: dbDeal.matches.map((m: DBMatch, i: number) => ({
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

  // Chat, WhatsApp, and Bulk Uploaded Mandates are three independent sources —
  // split by normalized source, never merged.
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
    // Optimistic UI update — guard against rawDeals not being an array
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
      deal.region.toLowerCase().includes(searchStr);
    const matchesStatus = statusFilter === 'All' || deal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
  };

  return (
    <div className="relative flex-1 flex flex-col w-full bg-white h-full">
      <div className="flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 overflow-y-auto">

        {/* Top Bar Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-black tracking-tight">Deal Log</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F3F4F6] border border-[#E5E7EB] rounded-full">
              <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-pulse" />
              <span className="text-[10px] font-medium text-[#16A34A] uppercase tracking-wider">Live</span>
            </div>
            {refreshing && (
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full animate-in fade-in slide-in-from-left-2 transition-all">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-[#FF6A00] rounded-full animate-spin" />
                <span className="text-[10px] font-medium text-black uppercase tracking-wider">Syncing Log...</span>
              </div>
            )}
          </div>
          <p className="text-black text-sm font-normal">Real-time status of your active proposals</p>
        </div>

        {/* Mandate Source Tabs — distinctly styled with icons, badge counts, and clear active states */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-[#F3F4F6] p-1.5 border border-[#E5E7EB] rounded-2xl w-fit max-w-full mb-8 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
              activeTab === 'chat'
                ? 'bg-white text-black shadow-sm ring-1 ring-black/5 font-medium'
                : 'text-black hover:bg-white/50'
            }`}
          >
            <MessageSquare size={16} className={activeTab === 'chat' ? 'text-[#FF6A00]' : 'text-black'} />
            <span>Chat Mandates</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              activeTab === 'chat' ? 'bg-[#F3F4F6] text-black border border-[#E5E7EB]' : 'bg-gray-200 text-black'
            }`}>
              {webDeals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
              activeTab === 'whatsapp'
                ? 'bg-white text-black shadow-sm ring-1 ring-black/5 font-medium'
                : 'text-black hover:bg-white/50'
            }`}
          >
            <MessageCircle size={16} className={activeTab === 'whatsapp' ? 'text-[#FF6A00]' : 'text-black'} />
            <span>WhatsApp Mandates</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              activeTab === 'whatsapp' ? 'bg-[#F3F4F6] text-black border border-[#E5E7EB]' : 'bg-gray-200 text-black'
            }`}>
              {whatsappDeals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
              activeTab === 'bulk'
                ? 'bg-white text-black shadow-sm ring-1 ring-black/5 font-medium'
                : 'text-black hover:bg-white/50'
            }`}
          >
            <UploadCloud size={16} className={activeTab === 'bulk' ? 'text-[#FF6A00]' : 'text-black'} />
            <span>Bulk Uploaded Mandates</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              activeTab === 'bulk' ? 'bg-[#F3F4F6] text-black border border-[#E5E7EB]' : 'bg-gray-200 text-black'
            }`}>
              {bulkDeals.length}
            </span>
          </button>
        </div>

        {/* Global Toolbar — Search + Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          {/* Search Bar */}
          <div data-onboarding-target="search" className="relative group w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black group-focus-within:text-[#FF6A00] transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by sector, keyword..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm font-normal text-black placeholder:text-gray-500 focus:bg-white focus:border-[#FF6A00]/40 focus:ring-1 focus:ring-[#FF6A00]/20 transition-all outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-gray-50 p-1 border border-gray-200 rounded-xl">
            {(['All', 'Searching Match', 'Matched'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === status
                    ? 'bg-white text-black shadow-sm ring-1 ring-black/5'
                    : 'text-black hover:bg-white/50'
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
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="max-w-6xl w-full">
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
