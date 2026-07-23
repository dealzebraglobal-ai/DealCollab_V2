'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import DealLogCard from '@/components/DealLogCard';
import { DealLogSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import { DealStatus } from '@/components/StatusBadge';
import { Match } from '@/components/MatchWindow';
import BulkMandatesTab from '@/components/BulkMandatesTab';
import { BulkMandate } from '@/components/BulkMandateCard';
import BulkUploadModal from '@/components/BulkUploadModal';
import { Search, X, Layers } from 'lucide-react';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  // If the API returned an error shape (or a non-array), treat it as an error
  // so SWR populates `error` instead of `data`, and the page shows ErrorState
  // rather than crashing with ".map is not a function".
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
  metadata?: { mandate_summary?: string;[key: string]: unknown };
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

export default function DealLogPage() {
  const router = useRouter();

  const { data: rawDeals, error, mutate, isValidating } = useSWR('/api/deals', fetcher, {
    refreshInterval: 15000, // Re-fetch every 15s for realtime feel
  });

  const loading = !rawDeals && !error;
  const refreshing = isValidating && !!rawDeals;

  const [expandedDealId, setExpandedDealId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Searching Match' | 'Matched'>('All');
  const [activeTab, setActiveTab] = useState<'chat' | 'bulk'>('chat');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const deals: Deal[] = (Array.isArray(rawDeals) ? rawDeals : []).map((dbDeal: DBDeal) => ({
    id: dbDeal.id,
    deal: `${dbDeal.intent || 'Deal'}: ${dbDeal.sectors?.[0] || 'Unknown Sector'}`,
    sector: dbDeal.sectors?.[0] || 'Unknown',
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
      finalScore: parseFloat(m.score) * 100,
      confidenceScore: parseFloat(m.similarity) * 100,
      // scores: MatchScores — derive from available data; breakdown not stored in this endpoint
      scores: {
        intent: parseFloat(m.score) * 100,
        industry: parseFloat(m.score) * 100,
        financial: parseFloat(m.score) * 100,
        niche: 0,
        geography: 0,
        similarity: parseFloat(m.similarity) * 100,
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
  }));

  // Chat Mandates and Bulk Uploaded Mandates are two independent sources —
  // split by proposals.source, never merged.
  const chatDeals = deals.filter(d => d.source !== 'BULK');
  const bulkDeals = deals.filter(d => d.source === 'BULK');

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
            <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Deal Log</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-100 rounded-full">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Live</span>
            </div>
            {refreshing && (
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full animate-in fade-in slide-in-from-left-2 transition-all">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Syncing Log...</span>
              </div>
            )}
          </div>
          <p className="text-[#6B7280] text-sm font-medium">Real-time status of your active proposals</p>
        </div>

        {/* Mandate Source Tabs — always visible; two independent, non-merged sources */}
        <div className="flex items-center gap-1 bg-gray-50 p-1 border border-gray-200 rounded-xl w-full sm:w-fit mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'chat'
              ? 'bg-white text-[#F97316] shadow-sm ring-1 ring-[#000000]/5'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Chat Mandates
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'bulk'
              ? 'bg-white text-[#F97316] shadow-sm ring-1 ring-[#000000]/5'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Bulk Uploaded Mandates
          </button>
        </div>

        {/* Global Toolbar — Search + Filters (unchanged logic, applies to Chat Mandates) */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          {/* Search Bar */}
          <div className="relative group w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#F97316] transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by sector, keyword..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:bg-white focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 transition-all outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-gray-50 p-1 border border-gray-200 rounded-xl">
            {(['All', 'Searching Match', 'Matched'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === status
                    ? 'bg-white text-[#F97316] shadow-sm ring-1 ring-[#000000]/5'
                    : 'text-gray-500 hover:text-gray-700'
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
        <div className="max-w-5xl w-full">
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
              actionLabel="Create Deal"
              onAction={() => { }}
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
