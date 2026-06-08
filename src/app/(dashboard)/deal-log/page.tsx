'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import DealLogCard from '@/components/DealLogCard';
import { DealLogSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import { DealStatus } from '@/components/StatusBadge';
import { Match } from '@/components/MatchWindow';
import { Search, X, Layers } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function generateFallbackSummary(intent?: string, sectors?: string[], geographies?: string[]): string {
  const intentMap: Record<string, string> = {
    'BUY_SIDE': 'acquisition opportunities',
    'SELL_SIDE': 'strategic buyers or investors',
    'FUNDRAISING': 'capital infusion',
    'DEBT': 'debt financing',
    'STRATEGIC_PARTNERSHIP': 'strategic partnerships'
  };
  
  const intentStr = intentMap[intent || ''] || 'strategic opportunities';
  const sectorStr = sectors?.length ? sectors.join(', ') : 'various sectors';
  const geoStr = geographies?.length ? ` across ${geographies.join(', ')}` : '';
  
  return `Actively exploring ${intentStr} within the ${sectorStr} space${geoStr}.`;
}

function cleanSummaryText(text?: string, fallbackIntent?: string, fallbackSectors?: string[], fallbackGeographies?: string[]): string {
  const fallback = generateFallbackSummary(fallbackIntent, fallbackSectors, fallbackGeographies);
  
  if (!text) return fallback;
  const lower = text.toLowerCase().trim();
  
  // Filter out short confirmation messages and common "find me matches" phrases
  if (
    lower === 'yes' || lower === 'yess' || lower === 'confirm' ||
    lower.includes('find me the matches') ||
    lower.includes('go ahead') ||
    lower.includes('start matching') ||
    lower.length < 30
  ) {
    // Preserve if it looks like an AI-generated summary despite being short
    if (lower.includes('your requirement') || lower.includes('got it') || lower.includes('captured your interest')) {
      return text;
    }
    return fallback;
  }
  return text;
}

interface DBMatch {
  id: string;
  score: string;
  similarity: string;
  reason?: string;
  counterparty?: {
    sector: string;
    geography: string;
    intent: string;
    raw_text?: string;
    normalised_text?: string;
    mandate_summary?: string | null;
  };
}

interface DBDeal {
  id: string;
  intent?: string;
  sectors?: string[];
  geographies?: string[];
  matches: DBMatch[];
  raw_text?: string;
  normalised_text?: string;
  metadata?: { mandate_summary?: string; [key: string]: unknown };
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
}

export default function DealLogPage() {
  const isLocked = false;
  const router = useRouter();
  
  const { data: rawDeals, error, mutate, isValidating } = useSWR('/api/deals', fetcher, {
    refreshInterval: 15000, // Re-fetch every 15s for realtime feel
  });

  const loading = !rawDeals && !error;
  const refreshing = isValidating && !!rawDeals;

  const [expandedDealId, setExpandedDealId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Searching Match' | 'Matched'>('All');

  const deals: Deal[] = (rawDeals || []).map((dbDeal: DBDeal) => ({
    id: dbDeal.id,
    deal: `${dbDeal.intent || 'Deal'}: ${dbDeal.sectors?.[0] || 'Unknown Sector'}`,
    sector: dbDeal.sectors?.[0] || 'Unknown',
    region: dbDeal.geographies?.[0] || 'Global',
    summary: dbDeal.metadata?.mandate_summary ||
      cleanSummaryText(dbDeal.normalised_text || dbDeal.raw_text || '', dbDeal.intent, dbDeal.sectors, dbDeal.geographies),
    status: dbDeal.matches && dbDeal.matches.length > 0 ? "Matched" : "Searching Match",
    matches: dbDeal.matches.map((m: DBMatch, i: number) => ({
       id: m.id,
       rank: i + 1,
       label: `P${i+1}`,
       proposalId: dbDeal.id,
       finalScore: parseFloat(m.score) * 100,
       confidenceScore: parseFloat(m.similarity) * 100,
       matchReason: m.reason || 'AI alignment detected.',
       counterparty: { 
         sector: m.counterparty?.sector || 'Unknown', 
         geography: m.counterparty?.geography || 'Global', 
         intent: m.counterparty?.intent || 'UNKNOWN',
         summary: m.counterparty?.mandate_summary ||
           cleanSummaryText(m.counterparty?.normalised_text || m.counterparty?.raw_text || '', m.counterparty?.intent, m.counterparty?.sector ? [m.counterparty.sector] : [], m.counterparty?.geography ? [m.counterparty.geography] : [])
       },
       status: 'ACTIVE',
       createdAt: new Date().toISOString()
    }))
  }));

  const handleDelete = async (id: string | number) => {
    // Optimistic UI updates can be added here
    mutate(rawDeals.filter((d: DBDeal) => d.id !== id), false);
    if (expandedDealId === id) setExpandedDealId(null);
  };

  const handleToggleExpand = (id: string | number) => {
    setExpandedDealId(prev => prev === id ? null : id);
  };

  const handleViewMatch = (match: Match) => {
    router.push(`/deal-log/${match.id}`);
  };

  const handleConnect = (match: Match) => {
    router.push(`/deal-dashboard?match=${match.id}`);
  };

  const filteredDeals = deals.filter(deal => {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
        <div>
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

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === status 
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
      </div>

      {/* Content Area */}
      <div className="max-w-5xl w-full">
        {loading ? (
          <DealLogSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => mutate()} />
        ) : deals.length === 0 ? (
          <EmptyState 
            title="Your Deal Log is empty"
            description="You haven't added any deals yet. Start by defining your first acquisition or sell-side proposal."
            actionLabel="Create Deal"
            onAction={() => {}}
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
                onConnectMatch={handleConnect}
              />
            ))}
          </div>
        )}
      </div>

      <div className="h-20 shrink-0" />
    </div>
    </div>
  );
}
