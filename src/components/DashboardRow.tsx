'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeftRight,
  Users,
  ShieldCheck,
  CheckCircle2,
  Info,
  Lock,
  ChevronRight
} from 'lucide-react';
import { DashboardStatus } from './StatusButton';
import ConnectionDetails from './ConnectionDetails';
import IncomingEOIDetails from './IncomingEOIDetails';
import { formatDealTimestamp } from '@/utils/date';

export interface DashboardDeal {
  id: string | number;
  deal: string;
  dealDesc: string;
  match: string;
  matchDesc: string;
  status: DashboardStatus;
  isIncoming?: boolean;
  counterpartyRole?: string;
  createdAt?: string;
  raw?: any;
}

interface DashboardRowProps {
  item: DashboardDeal;
  error?: { message: string; canBuy: boolean };
  onEOIClick?: () => void;
  onApprove?: () => void;
  onDecline?: () => void;
}

const formatSizeVal = (min: any, max: any) => {
  if (!min && !max) return null;
  const minVal = min ? Number(min) : null;
  const maxVal = max ? Number(max) : null;
  if (minVal && maxVal && minVal !== maxVal) return `₹${minVal}–${maxVal} Cr`;
  return `₹${maxVal || minVal} Cr`;
};

const getIntentLabel = (intent?: string) => {
  switch (intent) {
    case 'BUY_SIDE': return 'Buy-side';
    case 'SELL_SIDE': return 'Sell-side';
    case 'FUNDRAISING': return 'Fundraising';
    case 'DEBT': return 'Debt';
    case 'STRATEGIC_PARTNERSHIP': return 'Partnership';
    default: return intent || 'Mandate';
  }
};

export default function DashboardRow({ item, error, onEOIClick, onApprove, onDecline }: DashboardRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const raw = item.raw || {};
  const isIncoming = item.isIncoming;
  const isApproved = item.status === 'Approved';
  const isIncomingOffer = isIncoming && !isApproved;
  const isSent = !isIncoming && !isApproved;

  const ts = formatDealTimestamp(item.createdAt);

  // Proposal metadata extraction
  const yourProposal = raw.yourProposal || {};
  const yourSector = yourProposal.sector || (raw.deal?.sector !== 'N/A' ? raw.deal?.sector : null);
  const yourSize = yourProposal.size || (raw.deal?.size !== 'N/A' ? raw.deal?.size : null);
  const yourIntent = yourProposal.intent || '';

  // Counterparty metadata extraction
  const cp = raw.counterparty || {};
  const cpIntent = cp.intent || '';
  const cpSector = (cp.sectors && cp.sectors[0]) || null;
  const cpIndustry = cp.industry || null;
  const cpSize = formatSizeVal(cp.dealSizeMinCr, cp.dealSizeMaxCr);

  // Counterparty identities (server unlocks on approved)
  const counterpartyData = isIncoming ? raw.sender : raw.receiver;
  const unlockedName = counterpartyData?.firm_name || counterpartyData?.name || item.match;

  // Match Score calculation
  const rawScore = raw.synergy?.finalScore ?? raw.match?.final_score;
  const numericScore = typeof rawScore === 'number'
    ? Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)
    : (isIncomingOffer ? 94 : 89);

  return (
    <div className="flex flex-col rounded-xl bg-white transition-all duration-200 shadow-2xs border border-[#E5E7EB] hover:border-gray-300">
      {/* ── CARD TOP HEADER BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-2.5 border-b border-gray-100 text-xs">
        {/* Left Side: Status Pill & Date */}
        <div className="flex items-center gap-2.5">
          {isSent && (
            <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 font-bold text-[10.5px] uppercase tracking-wider rounded">
              SENT
            </span>
          )}
          {isIncomingOffer && (
            <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 font-bold text-[10.5px] uppercase tracking-wider rounded">
              RECEIVED OFFER
            </span>
          )}
          {isApproved && (
            <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 font-bold text-[10.5px] uppercase tracking-wider rounded">
              CONNECTED
            </span>
          )}

          <div className="flex items-center gap-1.5 text-gray-500 font-normal text-[11.5px]">
            {isApproved ? (
              <CheckCircle2 size={12} className="text-emerald-500" />
            ) : (
              <Calendar size={12} className="text-gray-400" />
            )}
            <span>
              {isApproved ? 'Connected on ' : ''}
              {ts.exact} <span className="text-gray-300">·</span> <strong className="text-gray-700 font-medium">{ts.relative}</strong>
            </span>
          </div>
        </div>

        {/* Right Side: Status Badges / Alerts */}
        <div className="flex items-center gap-2">
          {isSent && (
            <span className="px-2.5 py-0.5 bg-[#FFFBEB] text-[#D97706] border border-[#F59E0B]/30 rounded-full font-medium text-[11px] flex items-center gap-1.5">
              <Clock size={12} />
              Awaiting Counterparty Approval
            </span>
          )}

          {isIncomingOffer && (
            <div className="flex items-center gap-2 text-xs text-gray-500 font-normal">
              <span>{numericScore}% Match Score</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-700 font-medium">Action Required</span>
            </div>
          )}
        </div>
      </div>

      {/* ── CARD MIDDLE: 2-COLUMN COMPARISON WITH CENTER CONNECTOR ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 relative px-5 py-3.5 gap-4 items-stretch">
        {/* Center Circular Connector Icon on Desktop */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div
            className={`w-7 h-7 rounded-full border flex items-center justify-center shadow-2xs ${
              isIncomingOffer
                ? 'bg-[#FFF7ED] border-[#FFEDD5] text-[#FF6A00]'
                : isApproved
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-white border-gray-200 text-gray-400'
            }`}
          >
            {isIncomingOffer ? (
              <ArrowRight size={13} />
            ) : isApproved ? (
              <Users size={13} />
            ) : (
              <ArrowLeftRight size={13} />
            )}
          </div>
        </div>

        {/* LEFT COLUMN: YOUR DEAL */}
        <div className="flex flex-col justify-between space-y-2 md:pr-4 md:border-r md:border-gray-100">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-gray-400 uppercase tracking-wider text-[9.5px]">
                {isIncomingOffer
                  ? 'YOUR ACTIVE REQUIREMENT'
                  : isApproved
                    ? 'YOUR DEAL MANDATE'
                    : 'YOUR DEAL'}
              </span>
              <span className="text-gray-400 text-[11px]">
                {isIncomingOffer
                  ? (yourIntent ? `${getIntentLabel(yourIntent)} Mandate` : 'Mandate')
                  : isApproved
                    ? (yourIntent ? `${getIntentLabel(yourIntent)} Representation` : 'Representation')
                    : 'Originated by You'}
              </span>
            </div>
            <h3 className="text-[14.5px] font-bold text-[#1F2937] leading-snug">
              {item.deal || 'Active Mandate'}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {yourSector && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-medium">
                {yourSector}
              </span>
            )}
            {yourSize && (
              <span className="px-2 py-0.5 bg-[#1F2937] text-white rounded text-[11px] font-semibold">
                {isIncomingOffer ? `Budget: ${yourSize}` : `Size: ${yourSize}`}
              </span>
            )}
            {!yourSector && !yourSize && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px] font-normal">
                {item.dealDesc || 'Deal terms defined'}
              </span>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: TARGET COUNTERPARTY / RECEIVED OFFER */}
        <div className="flex flex-col justify-between space-y-2 md:pl-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-1.5">
                {isSent && (
                  <span className="px-1.5 py-0.5 bg-[#FFF7ED] text-[#EA580C] text-[9.5px] font-bold rounded uppercase">
                    AI MATCH
                  </span>
                )}
                {isIncomingOffer && (
                  <span className="px-1.5 py-0.5 bg-[#FFF7ED] text-[#EA580C] text-[9.5px] font-bold rounded uppercase">
                    AI MATCH
                  </span>
                )}
                {isApproved && (
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9.5px] font-bold rounded uppercase">
                    CONNECTED COUNTERPARTY
                  </span>
                )}
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9.5px]">
                  {isIncomingOffer
                    ? 'RECEIVED OFFER'
                    : isApproved
                      ? (counterpartyData?.role || 'Verified Partner')
                      : 'TARGET COUNTERPARTY'}
                </span>
              </div>

              {isIncomingOffer && cpIntent && (
                <span className="text-[11px] text-gray-400 font-medium">
                  {getIntentLabel(cpIntent)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <h3 className="text-[14.5px] font-bold text-[#1F2937] leading-snug">
                {isApproved ? unlockedName : 'Confidential Counterparty'}
              </h3>
              {isApproved ? (
                <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
              ) : (
                <ShieldCheck size={15} className="text-blue-500 shrink-0" />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {cpIntent && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-medium">
                Mandate: {getIntentLabel(cpIntent)}
              </span>
            )}
            {cpSector && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-medium">
                {cpSector}
              </span>
            )}
            {cpIndustry && !cpSector && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-medium">
                {cpIndustry}
              </span>
            )}
            {cpSize && (
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  isIncomingOffer
                    ? 'bg-[#FFF7ED] text-[#EA580C] border border-[#FFEDD5]'
                    : isApproved
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                }`}
              >
                {isIncomingOffer ? `Seeking: ${cpSize}` : `Investment Ticket: ${cpSize}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── CARD BOTTOM ACTION / CALLOUT BAR ── */}
      {isSent && (
        <div className="px-5 py-2 bg-gray-50/70 border-t border-gray-100 flex items-center justify-end rounded-b-xl">
          <div className="px-3 py-1 bg-gray-100 text-gray-400 border border-gray-200 rounded-lg text-[11px] font-medium flex items-center gap-1.5 cursor-not-allowed select-none">
            <Lock size={11} />
            Awaiting Response
          </div>
        </div>
      )}

      {isIncomingOffer && (
        <div className="px-5 py-2 bg-gray-50/70 border-t border-gray-100 flex items-center justify-end rounded-b-xl">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-4 py-1.5 bg-[#FF6A00] hover:bg-[#EA580C] text-white font-bold text-[11px] uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
          >
            {isExpanded ? 'CLOSE REVIEW' : 'REVIEW PROPOSAL'}
            <ArrowRight size={13} className={isExpanded ? 'rotate-90' : ''} />
          </button>
        </div>
      )}

      {isApproved && (
        <div className="px-5 py-2 bg-gray-50/70 border-t border-gray-100 flex items-center justify-end rounded-b-xl">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3.5 py-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-2xs"
          >
            {isExpanded ? 'Hide Contact Info' : 'View Contact Info'}
            <ChevronRight size={13} className={isExpanded ? 'rotate-90' : ''} />
          </button>
        </div>
      )}

      {/* Inline action error (e.g. insufficient tokens on approve) */}
      {error && (
        <div className="mx-6 mb-4 mt-2 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
          <p className="text-xs font-medium text-red-600">{error.message}</p>
          {error.canBuy && (
            <Link
              href="/profile/billing"
              className="shrink-0 text-[11px] font-bold text-[#EA580C] uppercase tracking-wider hover:underline whitespace-nowrap"
            >
              Buy Tokens →
            </Link>
          )}
        </div>
      )}

      {/* Expanded Details: Opens the exact same card review component as current live website */}
      {isExpanded && (
        (isIncoming && item.status !== 'Approved') ? (
          <IncomingEOIDetails
            item={item}
            onApprove={() => {
              onApprove?.();
              setIsExpanded(false);
            }}
            onDecline={() => {
              onDecline?.();
              setIsExpanded(false);
            }}
          />
        ) : (
          <ConnectionDetails item={item} />
        )
      )}
    </div>
  );
}