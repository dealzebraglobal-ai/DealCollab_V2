'use client';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
   ArrowLeft, ShieldCheck, Globe,
   TrendingUp, Clock, Info, AlertCircle,
   Sparkles, CheckCircle2
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

const formatSize = (min: string | number | null, max: string | number | null) => {
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
   const [showSuccessModal, setShowSuccessModal] = useState(false);

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

         if (json.errorCode === 'EOI_ALREADY_EXISTS') {
            addNotification({
               type: 'status',
               message: 'An Expression of Interest has already been sent for this match.',
               time: 'Just now'
            });
            mutate();
            router.push('/deal-dashboard');
            return;
         }

         await refreshProfile();

         addNotification({
            type: 'success',
            message: 'Expression of Interest sent. Tokens are charged only if the counterparty approves.',
            time: 'Just now'
         });

         mutate();
         setShowSuccessModal(true);
      } catch (err: unknown) {
         setSendError(err instanceof Error ? err.message : 'Something went wrong while sending EOI.');
      } finally {
         setIsSending(false);
      }
   };

   return (
      <div className="flex-1 flex flex-col w-full h-full bg-white relative overflow-y-auto">

         {/* TOP BAR / BREADCRUMB HEADER */}
         <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#E5E7EB] px-6 sm:px-10 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <button
                  onClick={() => router.back()}
                  className="p-2 hover:bg-[#F3F4F6] rounded-xl transition-all text-[#747775] hover:text-[#1F1F1F]"
                  title="Go back"
               >
                  <ArrowLeft size={18} />
               </button>
               <div className="flex items-center gap-2">
                  <Link href="/deal-log" className="text-sm font-semibold text-[#747775] hover:text-[#1F1F1F] transition-colors">
                     Deal Log
                  </Link>
                  <span className="text-xs text-[#E5E7EB]">/</span>
                  <span className="text-sm font-bold text-[#1F1F1F] tracking-tight">
                     Match Details
                  </span>
               </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#FFF7ED] border border-[#FFEDD5] rounded-full">
               <span className="w-1.5 h-1.5 bg-[#FF6A00] rounded-full animate-pulse" />
               <span className="text-[10px] font-bold text-[#EA580C] uppercase tracking-wider">Confidential Match</span>
            </div>
         </div>

         {/* TWO COLUMN CONTENT CONTAINER */}
         <div className="p-6 sm:p-10 max-w-7xl mx-auto w-full pb-20">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
               
               {/* LEFT COLUMN: Profile Details */}
               <div className="lg:col-span-8 space-y-5">
                  
                  {/* PRIVACY SHIELD WARNING */}
                  <div className="bg-[#F9FAFB] border border-[#E5E7EB] p-3.5 rounded-xl flex items-center gap-3 text-[#444746]">
                     <ShieldCheck size={18} className="text-[#FF6A00] shrink-0" />
                     <p className="text-xs font-medium">
                        <strong className="text-[#1F1F1F] font-semibold">Identity Protection Active:</strong> Contact details are protected until an Expression of Interest is approved.
                     </p>
                  </div>

                  {/* COUNTERPARTY DETAILS CARD */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] hover:border-black shadow-sm p-6 sm:p-8 space-y-6 transition-all duration-200">
                     <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3.5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-[#1F1F1F]">Counterparty Profile</h2>
                        <span className="text-[11px] font-semibold text-[#747775] bg-[#F3F4F6] border border-[#E5E7EB] px-2.5 py-0.5 rounded-full">
                           Verified Network
                        </span>
                     </div>

                     {/* 3-Column Data Grid for desktop */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Deal Structure</label>
                           <p className="text-sm font-semibold text-[#1F1F1F]">{getIntentLabel(counterparty.intent)}</p>
                           <p className="text-xs font-medium text-[#747775]">{counterparty.dealStructure || 'Standard Structure'}</p>
                        </div>

                        <div className="space-y-1">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Financial Range</label>
                           <p className="text-sm font-semibold text-[#1F1F1F] flex items-center gap-1.5">
                              <TrendingUp size={14} className="text-[#FF6A00]" />
                              Size: {formatSize(counterparty.dealSizeMinCr, counterparty.dealSizeMaxCr)}
                           </p>
                           <p className="text-xs font-medium text-[#747775] pl-5">
                              Rev: {formatSize(counterparty.revenueMinCr, counterparty.revenueMaxCr)}
                           </p>
                        </div>

                        <div className="space-y-1">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Geography</label>
                           <p className="text-sm font-semibold text-[#1F1F1F] flex items-center gap-1.5">
                              <Globe size={14} className="text-[#FF6A00]" />
                              {counterparty.geographies.join(', ') || 'Global'}
                           </p>
                        </div>
                     </div>

                     {/* Sectors Row */}
                     <div className="space-y-2 border-t border-[#E5E7EB] pt-4">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Sector Focus</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                           {counterparty.sectors.map((sector: string) => (
                              <span key={sector} className="px-3 py-1 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-xs font-semibold text-[#1F1F1F]">
                                 {sector}
                              </span>
                           ))}
                        </div>
                     </div>

                     {/* Anonymized Preview */}
                     <div className="space-y-2 border-t border-[#E5E7EB] pt-4">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Anonymized Preview</label>
                        <div className="text-xs font-normal text-[#1F1F1F] leading-relaxed bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB] mt-1">
                           {dealSummary ? (
                              <>
                                 <p className="italic leading-relaxed font-normal">
                                    &quot;{previewExpanded || dealSummary.length <= PREVIEW_TRUNCATE
                                       ? dealSummary
                                       : dealSummary.slice(0, PREVIEW_TRUNCATE).trimEnd() + '…'}&quot;
                                 </p>
                                 {dealSummary.length > PREVIEW_TRUNCATE && (
                                    <button
                                       onClick={() => setPreviewExpanded(prev => !prev)}
                                       className="mt-2 text-[11px] font-bold text-[#FF6A00] uppercase tracking-wider hover:underline block"
                                    >
                                       {previewExpanded ? 'Read Less' : 'Read More'}
                                    </button>
                                 )}
                              </>
                           ) : (
                              <p className="italic text-[#747775] font-normal">No preview available.</p>
                           )}
                        </div>
                     </div>

                     {/* Integrated Synergy Assessment */}
                     {synergy && (
                        <div className="bg-[#F9FAFB] p-5 rounded-2xl border border-[#E5E7EB] hover:border-black transition-all duration-200 space-y-3 mt-4 border-t pt-4">
                           <div className="flex items-center justify-between">
                              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#1F1F1F]">Synergy Assessment</h3>
                              <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] border border-[#86EFAC] text-[10px] font-bold uppercase tracking-wider text-[#15803D]">
                                 {synergy.alignmentBand} alignment
                              </span>
                           </div>
                           <p className="text-xs font-medium text-[#1F1F1F] leading-relaxed">{synergy.comment}</p>
                           <div className="grid grid-cols-3 gap-2.5 pt-1">
                              <div className="bg-white p-2.5 rounded-xl border border-[#E5E7EB] text-center shadow-sm">
                                 <p className="text-[9px] font-bold uppercase tracking-wider text-[#747775]">Sector</p>
                                 <p className="text-[11px] font-bold text-[#1F1F1F] mt-0.5 truncate">{synergy.sectorFit}</p>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-[#E5E7EB] text-center shadow-sm">
                                 <p className="text-[9px] font-bold uppercase tracking-wider text-[#747775]">Financial</p>
                                 <p className="text-[11px] font-bold text-[#1F1F1F] mt-0.5 truncate">{synergy.financialFit}</p>
                              </div>
                              <div className="bg-white p-2.5 rounded-xl border border-[#E5E7EB] text-center shadow-sm">
                                 <p className="text-[9px] font-bold uppercase tracking-wider text-[#747775]">Geography</p>
                                 <p className="text-[11px] font-bold text-[#1F1F1F] mt-0.5 truncate">{synergy.geographyFit}</p>
                              </div>
                           </div>
                        </div>
                     )}

                     {/* Verified Contact Details (Visible post EOI Approval) */}
                     {eoi?.status === 'approved' && counterparty.revealedContact && (
                        <div className="bg-[#DCFCE7]/60 p-4 rounded-2xl border border-[#86EFAC] space-y-2.5 mt-4">
                           <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#15803D] flex items-center gap-1.5">
                              <ShieldCheck size={14} /> Verified Contact Information
                           </h3>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="text-[9px] font-bold uppercase tracking-wider text-[#747775]">Advisor Name</label>
                                 <p className="text-xs font-bold text-[#1F1F1F] mt-0.5">{counterparty.revealedContact.advisor || 'Not provided'}</p>
                              </div>
                              <div>
                                 <label className="text-[9px] font-bold uppercase tracking-wider text-[#747775]">Contact Phone</label>
                                 <p className="text-xs font-bold text-[#1F1F1F] mt-0.5">{counterparty.revealedContact.phone || 'Not provided'}</p>
                              </div>
                           </div>
                        </div>
                     )}
                  </div>
               </div>

               {/* RIGHT COLUMN: Merged Score, Reason & Send EOI Block */}
               <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
                  
                  {/* UNIFIED ACTION CARD */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] hover:border-black shadow-sm p-6 space-y-5 transition-all duration-200">
                     
                     {/* Match Score */}
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#FFF7ED] border border-[#FFEDD5] rounded-xl flex items-center justify-center text-[#FF6A00] shrink-0">
                           <Sparkles size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                           <p className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Intelligence Match</p>
                           <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xl font-bold text-[#1F1F1F] leading-none">{formatMatchScore(match.finalScore)}</span>
                              <div className="flex-1 h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                                 <div className="h-full bg-[#FF6A00] rounded-full transition-all duration-500" style={{ width: `${normalizeMatchScoreNum(match.finalScore)}%` }} />
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Match Details Line */}
                     <div className="flex items-center justify-between text-xs border-t border-[#E5E7EB] pt-3">
                        <span className="font-semibold text-[#747775] uppercase tracking-wider text-[10px]">Match Type</span>
                        <span className="font-bold text-[#1F1F1F] flex items-center gap-1">
                           <Clock size={12} className="text-[#747775]" />
                           {match.matchArchetype}
                        </span>
                     </div>

                     {/* Match Explanation Callout */}
                     <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB] text-xs leading-relaxed text-[#1F1F1F]">
                        <strong className="block text-[10px] font-bold uppercase tracking-wider text-[#FF6A00] mb-1">Match Explanation</strong>
                        <p className="font-normal text-[#1F1F1F]">{match.matchReason}</p>
                     </div>

                     {/* Action Buttons */}
                     <div className="border-t border-[#E5E7EB] pt-3 w-full">
                        {eoi ? (
                           <button
                              disabled
                              className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-not-allowed flex items-center justify-center ${
                                 eoi.status === 'approved' 
                                    ? 'bg-[#16A34A] text-white shadow-sm' 
                                    : 'bg-[#F3F4F6] text-[#747775] border border-[#E5E7EB]'
                              }`}
                           >
                              {eoi.status === 'sent' && (eoi.isSender ? 'EOI Sent (Awaiting Approval)' : 'EOI Received')}
                              {eoi.status === 'approved' && 'Connected'}
                              {eoi.status === 'declined' && 'Declined'}
                           </button>
                        ) : (
                           <button
                              onClick={handleSendEOI}
                              disabled={isSending}
                              className="w-full bg-[#FF6A00] text-white py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-[#EA580C] hover:shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                              {isSending ? (
                                 <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Sending...
                                 </>
                              ) : (
                                 <>
                                    Send Expression of Interest
                                    <Sparkles size={13} />
                                 </>
                              )}
                           </button>
                        )}

                        {sendError && (
                           <div className="mt-3 flex flex-col gap-1.5 p-3 rounded-lg bg-red-50 border border-red-100 text-xs w-full">
                              <p className="font-semibold text-red-600">{sendError}</p>
                              {sendError.toLowerCase().includes('complete your profile') ? (
                                 <Link
                                    href={`/profile?returnUrl=${encodeURIComponent(`/deal-log/${id}`)}`}
                                    className="font-bold text-[#FF6A00] uppercase tracking-wider hover:underline text-[10px] mt-0.5"
                                 >
                                    Complete Profile →
                                 </Link>
                              ) : (
                                 <Link
                                    href="/profile/billing"
                                    className="font-bold text-[#FF6A00] uppercase tracking-wider hover:underline text-[10px] mt-0.5"
                                 >
                                    Buy Tokens →
                                 </Link>
                              )}
                           </div>
                        )}
                     </div>
                  </div>

                  {/* BOTTOM DISCLAIMER */}
                  <div className="flex items-start gap-2.5 px-3 text-[#747775]">
                     <Info size={13} className="shrink-0 mt-0.5" />
                     <p className="text-[10px] font-normal leading-relaxed">
                        Expression of Interest signals intent to the counterparty. Your full identity will be shared once they review and accept your EOI.
                     </p>
                  </div>
               </div>

            </div>
         </div>

         {/* EOI SUCCESS CONFIRMATION MODAL */}
         {showSuccessModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
               <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-[#E5E7EB] text-center space-y-5 animate-in zoom-in-95 duration-200">
                  <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto text-green-600 border border-green-100 shadow-sm">
                     <CheckCircle2 size={28} />
                  </div>
                  <div className="space-y-2">
                     <h3 className="text-lg font-bold text-[#1F1F1F] tracking-tight">
                        Your EOI is sent
                     </h3>
                     <p className="text-xs text-[#747775] font-medium leading-relaxed">
                        Tokens are charged only if counterparty approves it.
                     </p>
                  </div>
                  <div className="pt-2">
                     <button
                        onClick={() => {
                           setShowSuccessModal(false);
                           router.push('/deal-dashboard');
                        }}
                        className="px-6 py-2.5 bg-[#FF6A00] hover:bg-[#EA580C] text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm hover:shadow transition-all active:scale-95"
                     >
                        Okay
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
}
