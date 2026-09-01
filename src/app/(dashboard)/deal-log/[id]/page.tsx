'use client';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
   ArrowLeft, ShieldCheck, Globe,
   TrendingUp, Clock, Info, AlertCircle,
   Sparkles
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useNotifications } from '@/components/NotificationProvider';

import useSWR from 'swr';

import { formatMatchScore, normalizeMatchScoreNum } from '@/utils/formatters';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const getIntentLabel = (intent: string) => {
   switch (intent) {
      case 'BUY_SIDE': return 'Buy-Side Acquisition';
      case 'SELL_SIDE': return 'Sell-Side Divestment';
      case 'FUNDRAISING': return 'Equity Fundraising';
      case 'INVESTMENT': return 'Strategic Investment';
      case 'DEBT': return 'Debt Financing';
      case 'STRATEGIC_PARTNERSHIP': return 'Strategic Partnership';
      default: return intent;
   }
};

const formatSize = (min: any, max: any) => {
   if (!min && !max) return 'Undisclosed';
   const minVal = min ? Number(min) : null;
   const maxVal = max ? Number(max) : null;
   if (minVal && maxVal && minVal !== maxVal) return `₹${minVal}–${maxVal} Cr`;
   return `₹${maxVal || minVal} Cr`;
};

const PREVIEW_TRUNCATE = 400;

export default function MatchDetailPage() {
   const params = useParams();
   const router = useRouter();
   const { tokens, onboarding, profile, isProfileLoading, isProfileComplete, refreshProfile } = useUser();
   const { addNotification } = useNotifications();
   const id = params.id as string;

   const { data, error, mutate } = useSWR(`/api/matches/detail/${id}`, fetcher);
   const [isSending, setIsSending] = useState(false);
   const [sendError, setSendError] = useState<string | null>(null);
   const [previewExpanded, setPreviewExpanded] = useState(false);

   if (error) return (
      <div className="flex-1 p-10 max-w-4xl mx-auto w-full text-center space-y-4">
         <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
         <h2 className="text-xl font-bold text-gray-800">Failed to load match details</h2>
         <p className="text-sm text-gray-500">The match record may not exist or you do not have permission to view it.</p>
         <button onClick={() => router.back()} className="px-6 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold uppercase tracking-widest">
            Go Back
         </button>
      </div>
   );

   if (!data) return (
      <div className="flex-1 p-10 max-w-7xl mx-auto w-full space-y-8 animate-pulse">
         <div className="w-48 h-8 bg-gray-100 rounded-xl" />
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 h-96 bg-gray-50 rounded-[32px]" />
            <div className="lg:col-span-4 h-96 bg-gray-50 rounded-[32px]" />
         </div>
      </div>
   );

   const { match, counterparty, eoi, synergy } = data;

   const dealSummary = counterparty?.anonymizedPreview || counterparty?.teaser || '';

   const handleSendEOI = async () => {
      if (isProfileLoading) {
         return;
      }

      // 1. Pre-check: Must have completed profile
      const userProfileComplete = isProfileComplete || !!(
         onboarding?.profileCompleted ||
         profile?.profileCompleted ||
         profile?.profileCompletedOnce ||
         (profile?.profileCompletion ?? 0) >= 100
      );

      if (!userProfileComplete) {
         setSendError('Please complete your profile to unlock and send Expressions of Interest.');
         return;
      }

      // 2. Pre-check: Must have at least 50 tokens
      if ((tokens ?? 0) < 50) {
         setSendError('You need at least 50 tokens to send an Expression of Interest.');
         return;
      }

      setSendError(null);
      setIsSending(true);
      try {
         const resEoi = await fetch('/api/eois', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               dealId: match.proposalId,
               matchId: match.id,
               receiverId: counterparty.userId
            })
         });

         const json = await resEoi.json().catch(() => ({}));
         if (!resEoi.ok) {
            setSendError(json.message || json.error || 'Failed to send Expression of Interest');
            return;
         }

         await refreshProfile();

         addNotification({
            type: 'success',
            message: 'Expression of Interest sent. Tokens are charged only if the counterparty approves.',
            time: 'Just now'
         });

         mutate();
         router.push('/deal-dashboard');
      } catch (err: any) {
         setSendError(err?.message || 'Something went wrong while sending EOI.');
      } finally {
         setIsSending(false);
      }
   };

   return (
      <div className="flex-1 flex flex-col w-full h-full bg-[#F9FAFB] relative overflow-y-auto">

         {/* HEADER */}
         <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-gray-100 px-6 sm:px-10 py-4 flex items-center gap-4">
            <button
               onClick={() => router.back()}
               className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-[#1F2937]"
            >
               <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold text-[#1F2937] tracking-tight">Match Details</h1>
            <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-100 rounded-full">
               <span className="text-[10px] font-black text-[#F97316] uppercase tracking-widest">Confidential Match</span>
            </div>
         </div>

         {/* TWO COLUMN CONTENT CONTAINER */}
         <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full pb-20">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
               
               {/* LEFT COLUMN: Profile Details */}
               <div className="lg:col-span-8 space-y-4">
                  
                  {/* PRIVACY SHIELD WARNING - Compact */}
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl flex items-center gap-3 text-[#4B5563] animate-in fade-in duration-300">
                     <ShieldCheck size={18} className="text-[#F97316] shrink-0" />
                     <p className="text-xs font-medium">
                        <strong className="text-[#1F2937]">Identity Encryption Active:</strong> Contact details are hidden until EOI is approved.
                     </p>
                  </div>

                  {/* COUNTERPARTY DETAILS CARD */}
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-md p-6 space-y-6">
                     <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#1F2937]">Counterparty Profile</h2>
                     </div>

                     {/* 3-Column Data Grid for desktop */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Deal Structure</label>
                           <p className="text-sm font-bold text-[#1F2937]">{getIntentLabel(counterparty.intent)}</p>
                           <p className="text-xs font-medium text-[#6B7280]">{counterparty.dealStructure || 'Standard Structure'}</p>
                        </div>

                        <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Financial Range</label>
                           <p className="text-sm font-bold text-[#1F2937] flex items-center gap-1.5">
                              <TrendingUp size={14} className="text-green-500" />
                              Size: {formatSize(counterparty.dealSizeMinCr, counterparty.dealSizeMaxCr)}
                           </p>
                           <p className="text-xs font-medium text-[#6B7280] pl-5">
                              Rev: {formatSize(counterparty.revenueMinCr, counterparty.revenueMaxCr)}
                           </p>
                        </div>

                        <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Geography</label>
                           <p className="text-sm font-bold text-[#1F2937] flex items-center gap-1.5">
                              <Globe size={14} className="text-blue-500" />
                              {counterparty.geographies.join(', ') || 'Global'}
                           </p>
                        </div>
                     </div>

                     {/* Sectors Row */}
                     <div className="space-y-1 border-t border-gray-50 pt-4">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Sector Focus</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                           {counterparty.sectors.map((sector: string) => (
                              <span key={sector} className="px-2.5 py-1 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold text-[#4B5563]">
                                 {sector}
                              </span>
                           ))}
                        </div>
                     </div>

                     {/* Anonymized Preview */}
                     <div className="space-y-1 border-t border-gray-50 pt-4">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Anonymized Preview</label>
                        <div className="text-xs font-medium text-[#4B5563] leading-relaxed bg-gray-50/50 p-3.5 rounded-xl border border-gray-100 mt-1">
                           {dealSummary ? (
                              <>
                                 <p className="italic">
                                    &quot;{previewExpanded || dealSummary.length <= PREVIEW_TRUNCATE
                                       ? dealSummary
                                       : dealSummary.slice(0, PREVIEW_TRUNCATE).trimEnd() + '…'}&quot;
                                 </p>
                                 {dealSummary.length > PREVIEW_TRUNCATE && (
                                    <button
                                       onClick={() => setPreviewExpanded(prev => !prev)}
                                       className="mt-1.5 text-[10px] font-black text-[#F97316] uppercase tracking-widest hover:underline"
                                    >
                                       {previewExpanded ? 'Read Less' : 'Read More'}
                                    </button>
                                 )}
                              </>
                           ) : (
                              <p className="italic text-gray-400 font-normal">No preview available.</p>
                           )}
                        </div>
                     </div>

                     {/* Integrated Synergy Assessment */}
                     {synergy && (
                        <div className="bg-orange-50/30 p-4 rounded-2xl border border-orange-100/50 space-y-3 mt-4 border-t pt-4">
                           <div className="flex items-center justify-between">
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#F97316]">Synergy Assessment</h3>
                              <span className="px-2 py-0.5 rounded-full bg-white border border-orange-200 text-[9px] font-black uppercase tracking-widest text-[#F97316]">
                                 {synergy.alignmentBand} alignment
                              </span>
                           </div>
                           <p className="text-xs font-medium text-gray-700 leading-relaxed">{synergy.comment}</p>
                           <div className="grid grid-cols-3 gap-2 pt-0.5">
                              <div className="bg-white/80 p-2 rounded-lg border border-gray-100 text-center">
                                 <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Sector</p>
                                 <p className="text-[10px] font-bold text-gray-700 mt-0.5 truncate">{synergy.sectorFit}</p>
                              </div>
                              <div className="bg-white/80 p-2 rounded-lg border border-gray-100 text-center">
                                 <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Financial</p>
                                 <p className="text-[10px] font-bold text-gray-700 mt-0.5 truncate">{synergy.financialFit}</p>
                              </div>
                              <div className="bg-white/80 p-2 rounded-lg border border-gray-100 text-center">
                                 <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Geography</p>
                                 <p className="text-[10px] font-bold text-gray-700 mt-0.5 truncate">{synergy.geographyFit}</p>
                              </div>
                           </div>
                        </div>
                     )}

                     {/* Verified Contact Details (Visible post EOI Approval) */}
                     {eoi?.status === 'approved' && counterparty.revealedContact && (
                        <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100 space-y-2.5 mt-4">
                           <h3 className="text-[10px] font-black uppercase tracking-widest text-green-700 flex items-center gap-1.5">
                              <ShieldCheck size={14} /> Verified Contact Information
                           </h3>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="text-[8px] font-black uppercase tracking-widest text-gray-400">Advisor Name</label>
                                 <p className="text-xs font-bold text-gray-800 mt-0.5">{counterparty.revealedContact.advisor || 'Not provided'}</p>
                              </div>
                              <div>
                                 <label className="text-[8px] font-black uppercase tracking-widest text-gray-400">Contact Phone</label>
                                 <p className="text-xs font-bold text-gray-800 mt-0.5">{counterparty.revealedContact.phone || 'Not provided'}</p>
                              </div>
                           </div>
                        </div>
                     )}
                  </div>
               </div>

               {/* RIGHT COLUMN: Merged Score, Reason & Send EOI Block */}
               <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
                  
                  {/* UNIFIED ACTION CARD */}
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-5 space-y-5 animate-in fade-in slide-in-from-bottom-5 duration-500">
                     
                     {/* Match Score */}
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-[#F97316] shrink-0">
                           <Sparkles size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                           <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#6B7280]">Intelligence Match</p>
                           <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xl font-black text-[#1F2937] leading-none">{formatMatchScore(match.finalScore)}</span>
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                 <div className="h-full bg-gradient-to-r from-orange-400 to-[#F97316] rounded-full transition-all duration-500" style={{ width: `${normalizeMatchScoreNum(match.finalScore)}%` }} />
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Match Details Line */}
                     <div className="flex items-center justify-between text-[11px] border-t border-gray-50 pt-3">
                        <span className="font-bold text-gray-400 uppercase tracking-wider">Match Type</span>
                        <span className="font-bold text-[#1F2937] flex items-center gap-1">
                           <Clock size={11} className="text-gray-400" />
                           {match.matchArchetype}
                        </span>
                     </div>

                     {/* Match Explanation Callout */}
                     <div className="bg-orange-50/50 p-3.5 rounded-xl border border-orange-100/30 text-xs leading-relaxed text-gray-700">
                        <strong className="block text-[9px] font-black uppercase tracking-wider text-[#F97316] mb-1">Match Explanation</strong>
                        {match.matchReason}
                     </div>

                     {/* Action Buttons */}
                     <div className="border-t border-gray-50 pt-3 w-full">
                        {eoi ? (
                           <button
                              disabled
                              className="w-full bg-gray-100 text-gray-500 py-3 rounded-xl font-bold text-xs uppercase tracking-widest cursor-not-allowed flex items-center justify-center"
                           >
                              {eoi.status === 'sent' && (eoi.isSender ? 'EOI Sent (Awaiting Approval)' : 'EOI Received')}
                              {eoi.status === 'approved' && 'Connected'}
                              {eoi.status === 'declined' && 'Declined'}
                           </button>
                        ) : (
                           <button
                              onClick={handleSendEOI}
                              disabled={isSending}
                              className="w-full bg-[#F97316] text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/10 hover:bg-[#EA580C] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:translate-y-0"
                           >
                              {isSending ? (
                                 <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Sending...
                                 </>
                              ) : (
                                 <>
                                    Send EOI
                                    <Sparkles size={13} />
                                 </>
                              )}
                           </button>
                        )}

                        {sendError && (
                           <div className="mt-3 flex flex-col gap-1.5 p-3 rounded-lg bg-red-50 border border-red-100 text-xs w-full">
                              <p className="font-bold text-red-600">{sendError}</p>
                              {sendError.toLowerCase().includes('complete your profile') ? (
                                 <Link
                                    href={`/profile?returnUrl=${encodeURIComponent(`/deal-log/${id}`)}`}
                                    className="font-black text-[#F97316] uppercase tracking-widest hover:underline text-[10px] mt-0.5"
                                 >
                                    Complete Profile →
                                 </Link>
                              ) : (
                                 <Link
                                    href="/profile/billing"
                                    className="font-black text-[#F97316] uppercase tracking-widest hover:underline text-[10px] mt-0.5"
                                 >
                                    Buy Tokens →
                                 </Link>
                              )}
                           </div>
                        )}
                     </div>
                  </div>

                  {/* BOTTOM DISCLAIMER */}
                  <div className="flex items-start gap-2.5 px-3 text-gray-400">
                     <Info size={13} className="shrink-0 mt-0.5" />
                     <p className="text-[9px] font-medium leading-relaxed">
                        Expression of Interest signals intent to the counterparty. Your full professional identity will be shared once they review and accept your EOI.
                     </p>
                  </div>
               </div>

            </div>
         </div>
      </div>
   );
}
