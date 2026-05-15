'use client';
import React, { useState, useEffect, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, Calendar, Globe, Briefcase, 
  Target, Share2, MoreHorizontal, MessageSquare, 
  ShieldCheck, Sparkles, CheckCircle2,
  Clock, FileText, Link2
} from 'lucide-react';
import { DealDetailSkeleton, ErrorState } from '@/components/Skeleton';
import StatusBadge, { DealStatus } from '@/components/StatusBadge';
import { Match } from '@/components/MatchWindow';

interface DealDetail {
  id: string;
  title: string;
  description: string;
  sector: string;
  region: string;
  status: DealStatus;
  createdAt: string;
  valuation?: string;
  dealType: string;
  matches: Match[];
}

function mkMatch(id: string, label: string, sector: string, geography: string, intent: string, score: number, reason: string): Match {
  return {
    id, rank: parseInt(id.replace(/\D/g, '')) || 1, label,
    proposalId: 'mock', finalScore: score, confidenceScore: score * 0.9,
    scores: { intent: 0.95, industry: 0.85, financial: 0.7, niche: 0.6, geography: 0.03, similarity: 0.82 },
    matchReason: reason,
    counterparty: { sector, subSector: null, geography, intent, structure: null },
    status: 'ACTIVE', createdAt: new Date().toISOString(),
  };
}

const mockDealData: Record<string, DealDetail> = {
  "1": {
    id: "1",
    title: "Startup Funding Round: Fintech AI",
    description: "Series A funding looking for strategic investors in the fintech space. The company focuses on AI-driven credit scoring models for emerging markets.",
    sector: "Fintech / AI",
    region: "North America (Remote)",
    status: "Matched",
    createdAt: "Apr 12, 2026",
    valuation: "$25M - $30M",
    dealType: "Equity Fundraising",
    matches: [
      mkMatch("m1", "P1", "finserv", "North America", "BUY_SIDE", 92.3, "Matched due to: finserv sector alignment, early-stage fintech expertise."),
      mkMatch("m2", "P2", "finserv", "Global", "BUY_SIDE", 84.1, "Matched due to: financial compatibility, payment solutions interest."),
    ]
  },
  "101": {
    id: "101",
    title: "Acquisition Strategy: Cloud Infra",
    description: "Enterprise client looking for private cloud infrastructure partners to consolidate their European data center operations.",
    sector: "Cloud Infrastructure",
    region: "UK / Europe",
    status: "EOI Received",
    createdAt: "Apr 18, 2026",
    dealType: "Acquisition",
    matches: [
      mkMatch("m3", "P1", "saas", "Europe", "SELL_SIDE", 78.6, "Matched due to: cloud infrastructure alignment, GDPR compliance."),
    ]
  }
};

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [, startTransition] = useTransition();

  useEffect(() => {
    // Simulate API fetch
    const timer = setTimeout(() => {
      const data = mockDealData[id];
      startTransition(() => {
        if (data) {
          setDeal(data);
        } else {
          setError(true);
        }
        setLoading(false);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [id]);

  if (loading) return <DealDetailSkeleton />;
  if (error || !deal) return (
     <div className="flex-1 flex items-center justify-center p-10">
        <ErrorState onRetry={() => window.location.reload()} />
     </div>
  );

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-[#F9FAFB] relative overflow-y-auto overflow-x-hidden">
      
      {/* Dynamic Header / Breadcrumbs */}
      <div className="w-full bg-white border-b border-gray-100 py-4 px-6 sm:px-10 flex items-center justify-between sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/80">
        <div className="flex items-center gap-4">
           <button 
             onClick={() => router.back()}
             className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-400 hover:text-[#1F2937]"
           >
             <ArrowLeft size={20} />
           </button>
           <div className="h-4 w-[1px] bg-gray-100" />
           <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-xs font-bold text-gray-400 cursor-pointer hover:text-[#F97316]" onClick={() => router.push('/deal-log')}>Deal Log</span>
              <span className="text-[10px] text-gray-300">/</span>
              <span className="text-xs font-black text-[#1F2937] truncate">{deal.title}</span>
           </div>
        </div>
        <div className="flex items-center gap-3">
           <button className="p-2.5 text-gray-400 hover:text-[#1F2937] hover:bg-gray-50 rounded-xl transition-all">
              <Share2 size={18} />
           </button>
           <button className="p-2.5 text-gray-400 hover:text-[#1F2937] hover:bg-gray-50 rounded-xl transition-all">
              <MoreHorizontal size={18} />
           </button>
        </div>
      </div>

      <div className="flex-1 p-6 sm:p-10 max-w-7xl mx-auto w-full space-y-10">
        
        {/* Main Grid Layout */}
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-10">
           
           {/* Left Column: Deal Intelligence */}
           <div className="lg:col-span-8 flex flex-col gap-10">
              
              {/* Core Info Card */}
              <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="p-8 sm:p-10 space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                       <div className="space-y-4">
                          <StatusBadge status={deal.status} />
                          <h1 className="text-3xl sm:text-4xl font-bold text-[#1F2937] tracking-tight leading-tight">
                             {deal.title}
                          </h1>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-[#6B7280] font-medium">
                             <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-lg">
                                <Calendar size={14} className="text-[#9CA3AF]" />
                                <span>Created: {deal.createdAt}</span>
                             </div>
                             <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-lg">
                                <Target size={14} className="text-[#9CA3AF]" />
                                <span>Ref: DEAL-{deal.id}</span>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="pt-8 border-t border-gray-50 space-y-6">
                       <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#1F2937]">Deal Intelligence Overview</h3>
                       <p className="text-base sm:text-lg text-[#4B5563] leading-relaxed font-medium">
                          {deal.description}
                       </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6">
                       <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-3 hover:shadow-md transition-all">
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#F97316]">
                             <ShieldCheck size={14} />
                             <span>Compliance & Sector</span>
                          </div>
                          <p className="text-sm font-bold text-[#1F2937]">{deal.sector}</p>
                       </div>
                       <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-3 hover:shadow-md transition-all">
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-500">
                             <Globe size={14} />
                             <span>Operating Region</span>
                          </div>
                          <p className="text-sm font-bold text-[#1F2937]">{deal.region}</p>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Match Insights Section */}
              <div className="space-y-6">
                 <div className="flex items-center justify-between px-2">
                    <h2 className="text-xl font-bold text-[#1F2937] tracking-tight">AI Matching Insights</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                       {deal.matches.length} Matches Found
                    </span>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {deal.matches.map(match => (
                       <div key={match.id} className="group bg-white p-6 sm:p-8 rounded-[32px] border border-gray-100 shadow-md hover:shadow-xl transition-all cursor-pointer relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-orange-500/10 transition-all" />
                          <div className="relative z-10 space-y-4">
                             <div className="flex justify-between items-start">
                                <div className="w-12 h-12 bg-[#F97316]/10 rounded-2xl flex items-center justify-center text-[#F97316]">
                                   <Briefcase size={24} />
                                </div>
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-600 rounded-full">
                                   <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                                   <span className="text-[9px] font-black uppercase">Strong Match</span>
                                </div>
                             </div>
                             <div>
                                <h4 className="text-lg font-bold text-[#1F2937] group-hover:text-[#F97316] transition-colors">{match.label} — {match.counterparty.sector}</h4>
                                <p className="text-sm text-[#6B7280] font-medium leading-relaxed mt-2 line-clamp-2">
                                   {match.matchReason}
                                </p>
                             </div>
                             <button className="w-full py-3 bg-gray-50 border border-transparent rounded-xl text-xs font-bold text-[#1F2937] group-hover:bg-[#1F2937] group-hover:text-white transition-all">
                                View Profile Intelligence
                             </button>
                          </div>
                       </div>
                    ))}
                    
                    {/* Add New Suggestion Placeholder */}
                    <div className="bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-[32px] flex flex-col items-center justify-center p-8 gap-3 group hover:border-[#F97316]/50 hover:bg-orange-50/20 transition-all cursor-pointer">
                       <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-gray-300 group-hover:text-[#F97316] shadow-sm transition-all">
                          <Sparkles size={20} />
                       </div>
                       <div className="text-center">
                          <p className="text-xs font-black text-[#1F2937] uppercase tracking-widest">Discover More</p>
                          <p className="text-[10px] text-gray-400 font-bold mt-1">Refine filter to see more matches</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>

           {/* Right Column: Engagement Sidebar */}
           <div className="lg:col-span-4 space-y-8 pb-32">
              
              {/* Quick Actions Card */}
              <div className="bg-[#1F2937] text-white p-8 sm:p-10 rounded-[40px] shadow-2xl space-y-10 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#F97316]/10 rounded-full -mr-32 -mt-32 blur-[100px] pointer-events-none" />
                 
                 <div className="relative z-10 space-y-8">
                    <div>
                       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F97316] mb-3">Engagement Strategy</p>
                       <h3 className="text-2xl font-bold tracking-tight">Active Connection Hub</h3>
                    </div>

                    <div className="space-y-4">
                       <button className="w-full flex items-center justify-between px-6 py-4 bg-[#F97316] text-white rounded-[20px] font-bold text-sm hover:translate-x-1 transition-all group">
                          <span>Send Expression of Interest</span>
                          <Sparkles size={18} className="group-hover:rotate-12 transition-transform" />
                       </button>
                       <button className="w-full flex items-center justify-between px-6 py-4 bg-white/10 hover:bg-white/20 text-white rounded-[20px] font-bold text-sm transition-all border border-white/5">
                          <span>Secure Message Counterparty</span>
                          <MessageSquare size={18} className="text-gray-400" />
                       </button>
                       <button className="w-full flex items-center justify-between px-6 py-4 bg-white/10 hover:bg-white/20 text-white rounded-[20px] font-bold text-sm transition-all border border-white/5">
                          <span>Request Data Room Access</span>
                          <LockIcon size={18} className="text-gray-400" />
                       </button>
                    </div>

                    <div className="pt-10 border-t border-white/5 space-y-6">
                       <div className="flex items-center gap-4 group cursor-pointer">
                          <div className="p-3 bg-white/5 rounded-xl text-gray-400 group-hover:text-white transition-all">
                             <FileText size={20} />
                          </div>
                          <div>
                             <p className="text-xs font-bold">Deal Executive Summary</p>
                             <p className="text-[10px] text-gray-500 font-medium mt-0.5">Verified PDF • 1.2 MB</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-4 group cursor-pointer">
                          <div className="p-3 bg-white/5 rounded-xl text-gray-400 group-hover:text-white transition-all">
                             <Link2 size={20} />
                          </div>
                          <div>
                             <p className="text-xs font-bold">Industry Analysis Link</p>
                             <p className="text-[10px] text-gray-500 font-medium mt-0.5">Intelligence Layer Context</p>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Status Timeline Card */}
              <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-gray-100 shadow-xl space-y-8">
                 <h3 className="text-xs font-black uppercase tracking-widest text-[#6B7280]">Engagement Timeline</h3>
                 
                 <div className="space-y-8 relative">
                    <div className="absolute left-[15px] top-2 bottom-2 w-[1px] bg-gray-100" />
                    
                    <div className="relative flex items-start gap-5 group">
                       <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0 z-10 border-4 border-white shadow-sm ring-1 ring-green-100">
                          <CheckCircle2 size={12} strokeWidth={3} />
                       </div>
                       <div>
                          <p className="text-xs font-bold text-[#1F2937]">Matched by Intelligence Layer</p>
                          <p className="text-[10px] text-[#9CA3AF] font-bold mt-1 uppercase tracking-wider">Today, 2:45 PM</p>
                       </div>
                    </div>

                    <div className="relative flex items-start gap-5 opacity-60">
                       <div className="w-8 h-8 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center shrink-0 z-10 border-4 border-white shadow-sm">
                          <Clock size={12} strokeWidth={3} />
                       </div>
                       <div>
                          <p className="text-xs font-bold text-[#1F2937]">EOI Pending Approval</p>
                          <p className="text-[10px] text-[#D1D5DB] font-bold mt-1 uppercase tracking-wider">Awaiting User Action</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="h-20 shrink-0" />
    </div>
  );
}

function LockIcon({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
