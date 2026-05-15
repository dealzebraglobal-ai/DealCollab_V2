'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DealLogCard from '@/components/DealLogCard';
import { DealLogSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import { DealStatus } from '@/components/StatusBadge';
import { Match } from '@/components/MatchWindow';
import { useNotifications } from '@/components/NotificationProvider';
import { Search, X, Layers } from 'lucide-react';

interface Deal {
  id: number;
  deal: string;
  sector: string;
  region: string;
  status: DealStatus;
  matches: Match[];
  isNew?: boolean;
  isConnectionActive?: boolean;
}

// Helper to create mock match objects conforming to new Match interface
function mockMatch(id: string, label: string, sector: string, geography: string, intent: string, score: number, reason: string): Match {
  return {
    id,
    rank: parseInt(id.replace(/\D/g, '')) || 1,
    label,
    proposalId: 'mock-proposal',
    finalScore: score,
    confidenceScore: score * 0.9,
    scores: { intent: 0.95, industry: 0.85, financial: 0.7, niche: 0.6, geography: 0.03, similarity: 0.82 },
    matchReason: reason,
    counterparty: { sector, subSector: null, geography, intent, structure: null },
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
}

// Mock API simulation
const fetchDealsData = async (): Promise<Deal[]> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  return [
    {
      id: 1,
      deal: "Startup Funding Round",
      sector: "Fintech",
      region: "North America",
      status: "Matched",
      isNew: true,
      matches: [
        mockMatch("p1", "P1", "finserv", "North America", "BUY_SIDE", 92.3, "Matched due to: finserv sector alignment, acquisition appetite, ticket size compatibility."),
        mockMatch("p2", "P2", "finserv", "Global", "BUY_SIDE", 84.1, "Matched due to: enterprise software interest, financial compatibility, strategic rationale."),
        mockMatch("p3", "P3", "saas", "North America", "BUY_SIDE", 76.8, "Matched due to: B2B SaaS expertise, geography overlap, niche technology alignment."),
      ]
    },
    {
      id: 2,
      deal: "Infrastructure Merger Proposal",
      sector: "Energy",
      region: "Europe",
      status: "Searching Match",
      matches: []
    },
    {
       id: 3,
       deal: "Global Logistics Expansion",
       sector: "Logistics",
       region: "South Asia",
       status: "Matched",
       isConnectionActive: true,
       matches: [
         mockMatch("p1", "P1", "logistics", "South Asia", "BUY_SIDE", 88.5, "Matched due to: logistics sector match, last-mile delivery interest, regional geography overlap."),
         mockMatch("p2", "P2", "logistics", "Global", "BUY_SIDE", 79.2, "Matched due to: supply chain expertise, infrastructure alignment, digital transformation interest."),
         mockMatch("p3", "P3", "realestate", "South Asia", "BUY_SIDE", 65.4, "Matched due to: infrastructure focus, geography overlap, public-private partnership interest."),
       ]
    },
    {
      id: 4,
      deal: "Healthcare AI Seed Round",
      sector: "HealthTech",
      region: "Global",
      status: "Searching Match",
      matches: []
    }
  ];
};

import FeatureLockedOverlay from '@/components/FeatureLockedOverlay';

export default function DealLogPage() {
  const isLocked = false; // Feature lock enabled
  const router = useRouter();
  const { addNotification } = useNotifications();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Searching Match' | 'Matched'>('All');
  
  const getData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    setError(false);
    try {
      const data = await fetchDealsData();
      setDeals(data);
      if (isBackground) {
        addNotification({
          type: 'success',
          message: 'Deal statuses synced successfully.',
          time: 'Just now'
        });
      }
    } catch {
      if (!isBackground) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addNotification]);

  useEffect(() => {
    // Defer initial fetch to avoid synchronous setState warning in effect body
    const initTimer = setTimeout(() => {
      getData();
    }, 0);

    const interval = setInterval(() => {
      getData(true);
    }, 45000); // 45 seconds Log refresh

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [getData]);

  const handleDelete = (id: number) => {
    setDeals(prev => prev.filter(deal => deal.id !== id));
    if (expandedDealId === id) setExpandedDealId(null);
  };

  const handleToggleExpand = (id: number) => {
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
    <div className={`relative flex-1 flex flex-col w-full bg-white ${isLocked ? 'h-screen overflow-hidden' : 'h-full'}`}>
      {isLocked && <FeatureLockedOverlay />}
      <div className={`flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 ${isLocked ? 'pointer-events-none blur-md overflow-hidden' : 'overflow-y-auto'}`}>
      
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
          <ErrorState onRetry={() => getData()} />
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
