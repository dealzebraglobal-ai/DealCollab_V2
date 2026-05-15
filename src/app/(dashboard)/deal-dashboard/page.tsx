'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardRow, { DashboardDeal } from '@/components/DashboardRow';
import { DashboardSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import SendEOIModal from '@/components/SendEOIModal';
import { useNotifications } from '@/components/NotificationProvider';
import { LayoutGrid, PlusCircle } from 'lucide-react';

// Mock API simulation with expanded data
const fetchDashboardData = async (): Promise<DashboardDeal[]> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  return [
    { 
        id: 101, // Incoming
        deal: "Acquisition Strategy: Cloud Infra", 
        dealDesc: "Enterprise client looking for private cloud infrastructure partners.",
        match: "Sarah Jenkins (Potential Partner)", 
        matchDesc: "Managing Director at Ventura Capital with focus on Tech infrastructure.",
        status: "EOI Received",
        isIncoming: true
    },
    { 
        id: 1, 
        deal: "Startup Funding Round", 
        dealDesc: "Series A funding looking for strategic investors in the fintech space.",
        match: "Ventura Capital A", 
        matchDesc: "Leading early-stage fintech investor with a focus on disruptive payment solutions.",
        status: "Send EOI" 
    },
    { 
        id: 2, 
        deal: "Infrastructure Merger", 
        dealDesc: "Seeking expansion partner for major regional railway project.",
        match: "BuildCorp Infrastructure", 
        matchDesc: "Established civil engineering firm specializing in large-scale transit networks.",
        status: "EOI Sent — Awaiting Approval" 
    },
    { 
        id: 3, 
        deal: "SaaS Enterprise Expansion", 
        dealDesc: "Enterprise software provider looking for European distribution channel.",
        match: "EuroCloud Distribution", 
        matchDesc: "Top-tier IT distributor with extensive network across DACH and BENELUX regions.",
        status: "Approved" 
    }
  ];
};

import FeatureLockedOverlay from '@/components/FeatureLockedOverlay';

export default function DealDashboardPage() {
  const isLocked = false; // Feature lock enabled
  const { addNotification } = useNotifications();
  const [data, setData] = useState<DashboardDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [eoiModal, setEoiModal] = useState<{isOpen: boolean, deal: DashboardDeal | null}>({
    isOpen: false,
    deal: null
  });

  const getData = React.useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    
    setError(false);
    try {
      const result = await fetchDashboardData();
      setData(result);
      if (isBackground) {
        addNotification({
          type: 'success',
          message: 'Dashboard status updated in real-time.',
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
    const initTimer = setTimeout(() => {
      getData();
    }, 0);
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      getData(true);
    }, 30000);
    
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [getData]);

  const handleEOIRequest = (item: DashboardDeal) => {
    setEoiModal({ isOpen: true, deal: item });
  };

  const handleEOISuccess = () => {
    // Logic for successful EOI
  };

  const incomingEOIs = data.filter(item => item.isIncoming);
  const myProposals = data.filter(item => !item.isIncoming);

  return (
    <div className={`relative flex-1 flex flex-col w-full bg-white ${isLocked ? 'h-screen overflow-hidden' : 'h-full'}`}>
      {isLocked && <FeatureLockedOverlay />}
      <div className={`flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 relative ${isLocked ? 'pointer-events-none blur-md overflow-hidden' : 'overflow-y-auto'}`}>
      
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
          <ErrorState onRetry={getData} />
        ) : data.length === 0 ? (
          <EmptyState 
            title="No matches found yet" 
            description="Our Intelligence Layer is scanning for opportunities. Create a new deal to accelerate the process."
            actionLabel="Create Deal"
            onAction={() => {}}
            icon={<LayoutGrid size={32} />}
          />
        ) : (
          <div className="space-y-12">
            {/* Incoming Section */}
            {incomingEOIs.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-2 h-2 bg-[#F97316] rounded-full animate-pulse" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">Incoming Proposals ({incomingEOIs.length})</h2>
                </div>
                <div className="flex flex-col gap-6">
                  {incomingEOIs.map(item => (
                    <DashboardRow key={item.id} item={item} onEOIClick={() => handleEOIRequest(item)} />
                  ))}
                </div>
              </div>
            )}

            {/* My Proposals Section */}
            <div className="space-y-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-[#6B7280] px-1">My Proposals ({myProposals.length})</h2>
              <div className="flex flex-col gap-6">
                {myProposals.map(item => (
                  <DashboardRow key={item.id} item={item} onEOIClick={() => handleEOIRequest(item)} />
                ))}
              </div>
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
