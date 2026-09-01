'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/components/UserProvider';
import { useNotifications } from '@/components/NotificationProvider';
import { 
  ArrowLeft, CheckCircle2, XCircle, Info, Lock, 
  Sparkles, Target, Zap, ShieldCheck, Globe, Briefcase,
  AlertCircle, ChevronRight, Handshake, Coins
} from 'lucide-react';

export default function EOIReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { tokens, approveEOI, onboarding, profile, isProfileLoading, isProfileComplete } = useUser();
  const { addNotification } = useNotifications();
  const [isProcessing, setIsProcessing] = useState(false);
  const [decision, setDecision] = useState<'pending' | 'approved' | 'declined'>('pending');

  const userProfileComplete = isProfileComplete || !!(
    onboarding?.profileCompleted ||
    profile?.profileCompleted ||
    profile?.profileCompletedOnce ||
    (profile?.profileCompletion ?? 0) >= 100
  );

  // Mock Match Data
  const matchData = {
    ref: params.ref,
    matchScore: 94,
    myDeal: {
      title: 'Project Phoenix - SaaS Acquisition',
      type: 'Acquisition',
      budget: '$2M - $5M',
      location: 'North America',
      industry: 'Software / FinTech'
    },
    matchedDeal: {
      title: 'High-Growth AI CRM Platform',
      type: 'Sell-Side',
      valuation: '$3.5M',
      location: 'Austin, TX (Global)',
      industry: 'Enterprise Software'
    },
    highlights: [
      'Strong revenue alignment with Project Phoenix requirements',
      'Geographic focus within North American operational parameters',
      'Tech stack synergies identified in recent product audit',
      'Founder-led transition plan matches acquisition strategy'
    ],
    summary: 'This match represents a highly compatible opportunity based on your strategic acquisition criteria for Project Phoenix. The target company shows 85% overlap in technology vision and matches your preferred valuation multiples for the fiscal year.'
  };

  const handleApprove = () => {
    if (isProfileLoading) return;

    if (!userProfileComplete) {
      addNotification({
        type: 'error',
        message: 'Profile completion required for approval.',
        time: 'Just now'
      });
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      approveEOI(101); // Mock ID
      setDecision('approved');
      addNotification({
        type: 'success',
        message: 'EOI Approved. Identity unlocked.',
        time: 'Just now'
      });
      setIsProcessing(false);
    }, 1500);
  };

  const handleDecline = () => {
    setDecision('declined');
    addNotification({
      type: 'error',
      message: 'Match declined.',
      time: 'Just now'
    });
    setTimeout(() => router.push('/deal-dashboard'), 2000);
  };

  if (decision === 'approved') {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="max-w-xl w-full bg-white rounded-[40px] shadow-2xl p-10 text-center space-y-8 animate-in zoom-in-95 duration-500">
           <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} />
           </div>
           <div className="space-y-3">
              <h1 className="text-3xl font-bold text-[#1F2937]">Identity Unlocked</h1>
              <p className="text-gray-500 font-medium leading-relaxed">
                 You have successfully approved the EOI for <span className="text-[#1F2937] font-bold">{matchData.matchedDeal.title}</span>. 
                 You can now view contact details and start the discussion.
              </p>
           </div>
           
           <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 flex items-center justify-between">
              <div className="text-left">
                 <p className="text-[10px] font-black uppercase tracking-widest text-[#F97316]">Counterparty</p>
                 <p className="text-sm font-bold text-[#1F2937]">Sarah Jenkins (Director of M&A)</p>
                 <p className="text-xs text-gray-500 font-medium">jenkins.s@enterpriseai.com</p>
              </div>
              <Handshake className="text-[#F97316]" size={32} />
           </div>

           <button 
             onClick={() => router.push('/deal-dashboard')}
             className="w-full bg-[#1F2937] text-white py-4 rounded-2xl font-bold hover:bg-[#F97316] transition-all shadow-lg"
           >
              Return to Dashboard
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 flex flex-col h-full overflow-hidden">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-8 py-6 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-4">
            <button 
               onClick={() => router.back()}
               className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#F97316] hover:border-[#F97316]/20 transition-all"
            >
               <ArrowLeft size={18} />
            </button>
            <div>
               <h1 className="text-xl font-bold text-[#1F2937]">Review Match</h1>
               <p className="text-xs text-gray-400 font-medium tracking-tight">Ref: {params.ref} — Match Score: {matchData.matchScore}%</p>
            </div>
         </div>
         
         <div className="px-4 py-2 bg-orange-50 text-[#F97316] rounded-xl border border-orange-100 flex items-center gap-2">
            <ShieldCheck size={16} />
            <span className="text-xs font-black uppercase tracking-widest">Confidential Match</span>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 sm:p-10 pb-32">
         <div className="max-w-6xl mx-auto space-y-8">
            
            {/* COMPARISON GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
               {/* Connector Line/Icon */}
               <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="w-12 h-12 bg-white rounded-full shadow-xl border border-gray-50 flex items-center justify-center text-[#F97316]">
                     <Zap size={20} fill="currentColor" />
                  </div>
               </div>

               {/* MY DEAL */}
               <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -mr-8 -mt-8 flex items-center justify-center pt-8 pr-8">
                     <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 transform rotate-45">Your Deal</p>
                  </div>
                  
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                     <Briefcase size={24} />
                  </div>
                  <div className="space-y-1">
                     <h2 className="text-xl font-bold text-[#1F2937] leading-tight">{matchData.myDeal.title}</h2>
                     <p className="text-sm font-medium text-blue-600">{matchData.myDeal.type}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Budget</p>
                        <p className="text-sm font-bold text-[#1F2937]">{matchData.myDeal.budget}</p>
                     </div>
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Location</p>
                        <p className="text-sm font-bold text-[#1F2937]">{matchData.myDeal.location}</p>
                     </div>
                  </div>
               </div>

               {/* MATCHED DEAL */}
               <div className="bg-[#1F2937] p-8 rounded-[40px] shadow-2xl space-y-6 relative overflow-hidden text-white">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -mr-8 -mt-8 flex items-center justify-center pt-8 pr-8 text-white/20">
                     <Lock size={20} className="transform rotate-45" />
                  </div>
                  
                  <div className="w-12 h-12 bg-[#F97316] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-[#F97316]/20">
                     <Target size={24} />
                  </div>
                  <div className="space-y-1">
                     <h2 className="text-xl font-bold text-white leading-tight">{matchData.matchedDeal.title}</h2>
                     <p className="text-sm font-medium text-[#F97316]">{matchData.matchedDeal.type}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Valuation</p>
                        <p className="text-sm font-bold text-white">{matchData.matchedDeal.valuation}</p>
                     </div>
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Location</p>
                        <p className="text-sm font-bold text-white">{matchData.matchedDeal.location}</p>
                     </div>
                  </div>
               </div>
            </div>

            {/* MATCH INTELLIGENCE */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 space-y-8">
                  <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
                     <div className="flex items-center gap-3">
                        <div className="bg-orange-50 text-[#F97316] p-2 rounded-xl">
                           <Sparkles size={20} />
                        </div>
                        <h3 className="text-xl font-bold text-[#1F2937]">Match Intelligence</h3>
                     </div>
                     <p className="text-sm font-medium text-gray-500 leading-relaxed italic">
                        "{matchData.summary}"
                     </p>
                     <div className="space-y-4 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">Strategic Highlights</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           {matchData.highlights.map((h, i) => (
                              <div key={i} className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                 <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={16} />
                                 <span className="text-xs font-bold text-[#1F2937] leading-tight">{h}</span>
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>

               <div className="space-y-8">
                  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6 flex flex-col items-center text-center">
                     <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                        <Lock size={32} />
                     </div>
                     <div className="space-y-2">
                        <h4 className="text-lg font-bold text-[#1F2937]">Identify Locked</h4>
                        <p className="text-xs text-gray-400 font-medium leading-relaxed">
                           Detailed counterparty identity, contact info, and deal documents will unlock <span className="text-[#F97316] font-bold">immediately after both parties approve</span> the match.
                        </p>
                     </div>
                     <div className="w-full pt-4 space-y-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full justify-center">
                           <CheckCircle2 size={12} className="text-green-500" />
                           <span className="text-[10px] font-black uppercase text-green-600">Verification Active</span>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* FIXED ACTION BAR */}
      <div className="bg-white border-t border-gray-100 px-8 py-6 absolute bottom-0 left-0 right-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] z-30">
         <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
               {!isProfileLoading && !userProfileComplete ? (
                 <div className="flex items-center gap-3 p-3 bg-red-50 rounded-2xl border border-red-100">
                    <AlertCircle size={20} className="text-red-500" />
                    <div>
                       <p className="text-xs font-bold text-red-800 leading-tight">Complete Profile Required</p>
                       <p className="text-[10px] text-red-500 font-medium">Verify your identity to approve EOIs</p>
                    </div>
                 </div>
               ) : (
                 <div className="flex items-center gap-3">
                    <div className="bg-orange-50 p-2 rounded-xl text-[#F97316]">
                       <Coins size={20} />
                    </div>
                    <div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Approval Cost</p>
                       <p className="text-sm font-bold text-[#1F2937]">50 TOKENS</p>
                    </div>
                 </div>
               )}
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto">
               <button 
                  onClick={handleDecline}
                  className="flex-1 sm:flex-none px-10 py-4 rounded-2xl font-bold text-gray-500 hover:text-red-500 hover:bg-red-50 transition-all"
               >
                  Decline Match
               </button>
               <button 
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className={`flex-1 sm:flex-none px-12 py-4 rounded-2xl font-bold text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                    isProcessing ? 'bg-gray-400' : 'bg-[#1F2937] hover:bg-[#F97316] hover:shadow-[#F97316]/20'
                  }`}
               >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Approve EOI
                      <ChevronRight size={18} />
                    </>
                  )}
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
