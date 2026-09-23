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
import { formatExactDateTime } from '@/utils/date';
import IdentityCard from '@/components/IdentityCard';
import EOIContributionModal from '@/components/EOIContributionModal';

interface MatchDetailResponse {
   match: {
      id: string;
      proposalId: string;
      matchedProposalId: string;
      finalScore: number;
      matchReason: string;
      matchArchetype: string | null;
      status: string;
   };
   counterparty: {
      userId?: string;
      intent: string;
      sectors: string[] | null;
      geographies: string[] | null;
      dealStructure: string | null;
      dealSizeMinCr: string | number | null;
      dealSizeMaxCr: string | number | null;
      revenueMinCr: string | number | null;
      revenueMaxCr: string | number | null;
      industry?: string | null;
      qualityTier?: string | number | null;
      specialConditions?: string[];
      businessData?: { key: string; label: string; value: string }[];
      isConnected?: boolean;
      anonymizedPreview?: string;
      teaser?: string;
      revealedContact?: { advisor: string | null; phone: string | null } | null;
   };
   synergy: {
      alignmentBand: string;
      comment: string;
      sectorFit: string;
      financialFit: string;
      geographyFit: string;
   } | null;
   eoi: { id: string; status: string; isSender: boolean; approvedAt?: string | null } | null;
   userTokens?: number;
}

class ApiError extends Error {
   status: number;
   constructor(status: number, message: string) {
      super(message);
      this.status = status;
   }
}

/**
 * A naive `fetch(url).then(res => res.json())` treats EVERY response as
 * success data — including a 401/403/404/500 JSON error body (`{error: "..."}`
 * becomes truthy `data`, so the page renders past the loading/error checks and
 * crashes destructuring `undefined` fields out of it), an HTML error page
 * (JSON.parse throws on `<html>...`), or an empty body. This fetcher
 * classifies the response first so the page can show a real, status-specific
 * message instead of crashing or showing a raw error page.
 */
const fetcher = async (url: string): Promise<MatchDetailResponse> => {
   let res: Response;
   try {
      res = await fetch(url);
   } catch {
      throw new ApiError(0, 'Network error — check your connection and try again.');
   }

   const contentType = res.headers.get('content-type') || '';
   let body: ({ error?: string; message?: string } & Partial<MatchDetailResponse>) | null = null;
   if (contentType.includes('application/json')) {
      body = await res.json().catch(() => null);
   } else {
      await res.text().catch(() => ''); // drain HTML/plain-text bodies without parsing as JSON
   }

   if (!res.ok) {
      throw new ApiError(res.status, body?.error || body?.message || `Request failed (HTTP ${res.status})`);
   }
   if (!body) {
      throw new ApiError(res.status, 'Received an unexpected empty response.');
   }
   return body as MatchDetailResponse;
};

function mandateErrorState(status: number): { title: string; message: string; showRetry: boolean } {
   switch (status) {
      case 401:
         return { title: 'Session expired', message: 'Please sign in again to view this mandate.', showRetry: false };
      case 403:
         return { title: 'Access restricted', message: "You don't have permission to view this mandate.", showRetry: false };
      case 404:
         return { title: 'Mandate not found', message: 'It may have been removed or is no longer available.', showRetry: false };
      case 429:
         return { title: 'Too many requests', message: 'Please wait a moment and try again.', showRetry: true };
      case 0:
         return { title: 'Network error', message: 'Check your connection and try again.', showRetry: true };
      default:
         return { title: "We couldn't load this mandate", message: 'Please try again in a moment.', showRetry: true };
   }
}

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

   const { data, error, mutate, isValidating } = useSWR(
      id ? `/api/matches/detail/${id}` : null,
      fetcher,
      {
         // Don't retry a 401/403/404 — it won't change without user action, and
         // hammering the endpoint on a permission/not-found error wastes requests.
         shouldRetryOnError: (err) => !(err instanceof ApiError) || ![401, 403, 404].includes(err.status),
      },
   );
   const [isSending, setIsSending] = useState(false);
   const [sendError, setSendError] = useState<string | null>(null);
   const [previewExpanded, setPreviewExpanded] = useState(false);
   const [showSuccessModal, setShowSuccessModal] = useState(false);

   // Missing mandate ID (e.g. malformed deep link) — same clean state as a 404, no API call made.
   if (!id) {
      const s = mandateErrorState(404);
      return (
         <div className="flex-1 p-10 max-w-4xl mx-auto w-full text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-800">{s.title}</h2>
            <p className="text-sm text-gray-500">{s.message}</p>
            <button onClick={() => router.push('/deal-log')} className="px-6 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold uppercase tracking-widest">
               Go Back
            </button>
         </div>
      );
   }

   if (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const s = mandateErrorState(status);
      return (
         <div className="flex-1 p-10 max-w-4xl mx-auto w-full text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-800">{s.title}</h2>
            <p className="text-sm text-gray-500">{s.message}</p>
            <div className="flex items-center justify-center gap-3">
               {s.showRetry && (
                  <button
                     onClick={() => mutate()}
                     disabled={isValidating}
                     className="px-6 py-2 bg-[#FF6A00] hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                     {isValidating ? 'Retrying…' : 'Retry'}
                  </button>
               )}
               {status === 401 ? (
                  <button onClick={() => router.push('/login')} className="px-6 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold uppercase tracking-widest">
                     Sign In
                  </button>
               ) : (
                  <button onClick={() => router.push('/deal-log')} className="px-6 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold uppercase tracking-widest">
                     Go Back
                  </button>
               )}
            </div>
         </div>
      );
   }

   if (!data) return (
      <div className="flex-1 p-10 max-w-7xl mx-auto w-full space-y-8 animate-pulse">
         <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Loading mandate…</p>
         <div className="w-48 h-8 bg-gray-100 rounded-xl" />
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 h-96 bg-gray-50 rounded-[32px]" />
            <div className="lg:col-span-4 h-96 bg-gray-50 rounded-[32px]" />
         </div>
      </div>
   );

   // One malformed match/counterparty payload must not crash the whole page —
   // render the same "couldn't load" state instead of an uncaught TypeError.
   if (!data.match || !data.counterparty) {
      const s = mandateErrorState(500);
      return (
         <div className="flex-1 p-10 max-w-4xl mx-auto w-full text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-800">{s.title}</h2>
            <p className="text-sm text-gray-500">{s.message}</p>
            <button onClick={() => mutate()} className="px-6 py-2 bg-[#FF6A00] hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold uppercase tracking-widest">
               Retry
            </button>
         </div>
      );
   }

   const { match, eoi, synergy } = data;
   // Defensive defaults — a WhatsApp-created counterparty proposal can legitimately
   // have empty arrays for these (no sector/geography captured yet); the JSX below
   // calls .join()/.map() on them unconditionally.
   const counterparty = {
      ...data.counterparty,
      sectors: Array.isArray(data.counterparty.sectors) ? data.counterparty.sectors : [],
      geographies: Array.isArray(data.counterparty.geographies) ? data.counterparty.geographies : [],
   };

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

         // Sending an EOI is confirmed via the success modal below — it does not need
         // its own entry in the persistent notification feed (that feed is reserved for
         // events the user didn't just trigger themselves, e.g. a new match or an
         // incoming EOI). The EOI record itself is unaffected either way.
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

                  {/* COMPLETE DEAL INFORMATION — every non-identifying structured field the API
                      actually returns, grouped for scanability. Nothing here is fabricated: a
                      field only appears when the underlying record has a value; otherwise the
                      existing "Not provided" convention is used (never hidden silently, never invented). */}
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] hover:border-black shadow-sm p-6 sm:p-8 space-y-6 transition-all duration-200">
                     <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3.5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-[#1F1F1F]">Complete Deal Information</h2>
                        <span className="text-[11px] font-semibold text-[#747775] bg-[#F3F4F6] border border-[#E5E7EB] px-2.5 py-0.5 rounded-full">
                           Verified Network
                        </span>
                     </div>

                     {/* DEAL OVERVIEW */}
                     <div className="space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#EA580C]">Deal Overview</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Intent / Structure</label>
                              <p className="text-sm font-semibold text-[#1F1F1F]">{getIntentLabel(counterparty.intent)}</p>
                              <p className="text-xs font-medium text-[#747775]">{counterparty.dealStructure || 'Not provided'}</p>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Industry</label>
                              <p className="text-sm font-semibold text-[#1F1F1F]">{counterparty.industry || 'Not provided'}</p>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Geography</label>
                              <p className="text-sm font-semibold text-[#1F1F1F] flex items-center gap-1.5">
                                 <Globe size={14} className="text-[#FF6A00]" />
                                 {counterparty.geographies.join(', ') || 'Not provided'}
                              </p>
                           </div>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Sector Focus</label>
                           <div className="flex flex-wrap gap-2 mt-1">
                              {counterparty.sectors.length > 0 ? counterparty.sectors.map((sector: string) => (
                                 <span key={sector} className="px-3 py-1 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-xs font-semibold text-[#1F1F1F]">
                                    {sector}
                                 </span>
                              )) : (
                                 <span className="text-xs font-medium text-[#747775] italic">Not provided</span>
                              )}
                           </div>
                        </div>
                     </div>

                     {/* FINANCIALS */}
                     <div className="space-y-3 border-t border-[#E5E7EB] pt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#EA580C]">Financials</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Deal Size</label>
                              <p className="text-sm font-semibold text-[#1F1F1F] flex items-center gap-1.5">
                                 <TrendingUp size={14} className="text-[#FF6A00]" />
                                 {formatSize(counterparty.dealSizeMinCr, counterparty.dealSizeMaxCr)}
                              </p>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Revenue</label>
                              <p className="text-sm font-semibold text-[#1F1F1F]">{formatSize(counterparty.revenueMinCr, counterparty.revenueMaxCr)}</p>
                           </div>
                        </div>
                     </div>

                     {/* BUSINESS PROFILE — structured, non-identifying attributes captured during
                         qualification (capacity, certifications, business model, etc). Only ever
                         shows fields that actually exist on the record (M5_blindCard allowlist). */}
                     {counterparty.businessData && counterparty.businessData.length > 0 && (
                        <div className="space-y-3 border-t border-[#E5E7EB] pt-4">
                           <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#EA580C]">Business Profile</p>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {counterparty.businessData.map((field) => (
                                 <div key={field.key} className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">{field.label}</label>
                                    <p className="text-sm font-semibold text-[#1F1F1F]">{field.value}</p>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}

                     {/* TRANSACTION REQUIREMENTS — special conditions only ever populated once connected (see M5_blindCard) */}
                     <div className="space-y-2 border-t border-[#E5E7EB] pt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#EA580C]">Transaction Requirements</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                           {counterparty.specialConditions && counterparty.specialConditions.length > 0 ? (
                              counterparty.specialConditions.map((cond: string) => (
                                 <span key={cond} className="px-3 py-1 bg-[#FFF7ED] border border-[#FFEDD5] rounded-lg text-xs font-semibold text-[#EA580C]">
                                    {cond}
                                 </span>
                              ))
                           ) : (
                              <span className="text-xs font-medium text-[#747775] italic">
                                 {counterparty.isConnected ? 'Not provided' : 'Visible after Expression of Interest is approved'}
                              </span>
                           )}
                        </div>
                     </div>

                     {/* STRATEGIC RATIONALE / OVERVIEW */}
                     <div className="space-y-2 border-t border-[#E5E7EB] pt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#EA580C]">Strategic Rationale</p>
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

                     {/* OTHER AVAILABLE INFORMATION */}
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-[#E5E7EB] pt-4">
                        <p className="col-span-full text-[10px] font-black uppercase tracking-[0.15em] text-[#EA580C]">Other Available Information</p>
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Quality Tier</label>
                           <p className="text-sm font-semibold text-[#1F1F1F]">
                              {counterparty.qualityTier ? `Tier ${counterparty.qualityTier}` : 'Not provided'}
                           </p>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Match Reference</label>
                           <p className="text-sm font-semibold text-[#1F1F1F]">#{String(match.id).slice(-6).toUpperCase()}</p>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Mandate ID</label>
                           <p className="text-sm font-semibold text-[#1F1F1F]">#{String(match.proposalId).slice(-6).toUpperCase()}</p>
                        </div>
                     </div>

                     {/* MATCH ANALYSIS */}
                     {synergy && (
                        <div className="bg-[#F9FAFB] p-5 rounded-2xl border border-[#E5E7EB] hover:border-black transition-all duration-200 space-y-3 mt-4 border-t pt-4">
                           <div className="flex items-center justify-between">
                              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#EA580C]">Match Analysis</p>
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

                  {/* IDENTITY CARD (Locked pre-approval, Disclosure post-approval) */}
                  <IdentityCard
                     mode={counterparty.isConnected ? 'disclosure' : 'locked'}
                     data={{
                        fullName: counterparty.isConnected && counterparty.revealedContact?.advisor ? counterparty.revealedContact.advisor : null,
                        designation: counterparty.isConnected ? 'Advisory Partner · DealCollab Network' : 'Senior advisor · boutique firm',
                        organisation: counterparty.isConnected ? 'Verified Advisory Partner' : null,
                        headline: dealSummary || undefined,
                        mandateSide: counterparty.intent ? counterparty.intent.replace(/_/g, '-').toLowerCase() : 'sell-side',
                        ticketBand: formatSize(counterparty.dealSizeMinCr, counterparty.dealSizeMaxCr) !== 'Undisclosed'
                           ? formatSize(counterparty.dealSizeMinCr, counterparty.dealSizeMaxCr)
                           : undefined,
                        // Do NOT expose closedCount or expertise for counterparty — these are personal profile
                        // attributes only available after EOI approval and explicit disclosure by the owner.
                        closedCount: null,
                        expertise: counterparty.isConnected ? ['M&A Advisory', 'Deal Structuring'] : undefined,
                        sectors: counterparty.sectors.slice(0, 4),
                        geographies: counterparty.geographies.slice(0, 3),
                        phone: counterparty.isConnected ? counterparty.revealedContact?.phone ?? null : null,
                        email: null,  // Email is never pre-disclosed; only phone via revealedContact
                        location: counterparty.geographies[0] ? `${counterparty.geographies[0]} region` : 'India region',
                        isVerified: true,
                        intentFitScore: Math.round(Number(match.finalScore) || 70),
                        matchReference: `DC-M-${String(match.id).slice(-4).toUpperCase()} · ${counterparty.sectors[0] || 'Advisory'} · ${formatSize(counterparty.dealSizeMinCr, counterparty.dealSizeMaxCr)}`,
                        matchedMandateText: `MATCHED ON DC-M-${String(match.id).slice(-4).toUpperCase()} · ${counterparty.intent} · ${formatSize(counterparty.dealSizeMinCr, counterparty.dealSizeMaxCr)}`,
                        eoiReference: eoi ? String(eoi.id).slice(-4).toUpperCase() : undefined,
                        // Real approval timestamp (eois.approved_at) — was fabricated as
                        // formatExactDateTime(new Date()) previously, so it silently changed to
                        // "now" on every page reload instead of showing when disclosure actually
                        // happened. Falls back to the EOI's created_at (still real, stored data)
                        // for rows approved before the approved_at column existed.
                        disclosureTimestamp: counterparty.isConnected && (eoi?.approvedAt)
                           ? formatExactDateTime(eoi.approvedAt)
                           : undefined,
                     }}
                     onAction={!eoi ? handleSendEOI : undefined}
                     actionLoading={isSending}
                     actionLabel={!eoi ? 'Send Expression of Interest' : undefined}
                     showExportButtons={!!counterparty.isConnected}
                  />

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

         {/* EOI CONTRIBUTION / THANK-YOU CARD (Replaces legacy modal) */}
         <EOIContributionModal
            isOpen={showSuccessModal}
            onClose={() => {
               setShowSuccessModal(false);
               router.push('/deal-dashboard');
            }}
            onContinue={() => {
               setShowSuccessModal(false);
               router.push('/deal-dashboard');
            }}
         />
      </div>
   );
}
