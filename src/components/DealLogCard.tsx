'use client';
import React from 'react';
import { Clock, Trash2, ChevronDown, ArrowRight } from 'lucide-react';
import { DealStatus } from './StatusBadge';
import MatchWindow, { Match } from './MatchWindow';
import { formatDealTimestamp } from '@/utils/date';

interface DealLogCardProps {
  deal: {
    id: string | number;
    deal: string;
    sector: string;
    region: string;
    status: DealStatus;
    matches: Match[];
    isNew?: boolean;
    isConnectionActive?: boolean;
    summary?: string;
    createdAt?: string;
    intent?: string;
    dealSizeMinCr?: number | null;
    dealSizeMaxCr?: number | null;
    structure?: string | null;
    metadata?: any;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onViewMatch: (match: Match) => void;
  onConnectMatch?: (match: Match) => void;
}

function getStructureLabel(deal: { intent?: string; structure?: string | null; metadata?: any }) {
  if (deal.structure) return deal.structure;
  if (deal.metadata?.deal_structure) return String(deal.metadata.deal_structure);
  if (deal.metadata?.dealStructure) return String(deal.metadata.dealStructure);

  switch (deal.intent) {
    case 'SELL_SIDE':
      return 'Majority / 100% Sale';
    case 'BUY_SIDE':
      return 'Strategic Acquisition';
    case 'FUNDRAISING':
      return 'Equity Investment';
    case 'DEBT':
      return 'Debt Financing';
    case 'STRATEGIC_PARTNERSHIP':
      return 'Strategic Joint Venture';
    default:
      return 'Majority / 100% Sale';
  }
}

function getTopLineLabel(deal: { dealSizeMinCr?: number | null; dealSizeMaxCr?: number | null; metadata?: any }) {
  const min = deal.dealSizeMinCr ?? (deal.metadata?.dealSizeMinCr || deal.metadata?.revenueMinCr);
  const max = deal.dealSizeMaxCr ?? (deal.metadata?.dealSizeMaxCr || deal.metadata?.revenueMaxCr);

  if (min && max && min !== max) {
    return `₹${min}–${max} Cr`;
  }
  if (min || max) {
    return `₹${max || min} Cr`;
  }
  if (deal.metadata?.revenue) {
    return String(deal.metadata.revenue);
  }
  return '₹75 Cr ARR';
}

export default function DealLogCard({
  deal,
  isExpanded,
  onToggle,
  onDelete,
  onViewMatch,
}: DealLogCardProps) {
  const ts = deal.createdAt ? formatDealTimestamp(deal.createdAt) : null;
  const structureLabel = getStructureLabel(deal);
  const topLineLabel = getTopLineLabel(deal);
  const isMatched = deal.status === 'Matched' || (deal.matches && deal.matches.length > 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div className="w-full flex flex-col group">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className={`border border-[#E5E7EB] hover:border-gray-300 transition-all duration-200 rounded-xl p-4 sm:px-5 sm:py-3.5 cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C] ${
          isExpanded ? 'bg-white ring-1 ring-gray-200' : 'bg-white'
        }`}
      >
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14.5px] font-bold text-[#1F2937] leading-snug">
                {deal.deal}
              </h3>
              {deal.isNew && (
                <span className="px-1.5 py-0.2 bg-[#FF6A00] text-white rounded text-[9.5px] font-bold uppercase tracking-wider">
                  NEW
                </span>
              )}
            </div>

            {ts && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-normal">
                <Clock size={11} className="text-gray-400" />
                <span>
                  {ts.exact} <span className="text-gray-300">•</span> {ts.relative}
                </span>
              </div>
            )}
          </div>

          {/* Top Right Status Badge & Delete Action */}
          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onToggle}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                isMatched
                  ? 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] hover:bg-[#D1FAE5]'
                  : 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] hover:bg-[#FEF3C7]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isMatched ? 'bg-[#10B981]' : 'bg-[#F59E0B]'}`} />
              <span>{isMatched ? 'Matched' : 'Searching'}</span>
              <ChevronDown size={12} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Are you sure you want to delete this mandate?')) {
                  onDelete();
                }
              }}
              title="Delete Mandate"
              disabled={deal.isConnectionActive}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Summary Description */}
        {deal.summary && (
          <p className="text-[13px] text-gray-600 line-clamp-2 leading-relaxed font-normal mt-2">
            {deal.summary}
          </p>
        )}

        {/* Deal Metrics Chips: Top-line, Structure, Geography */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 text-[10.5px] font-medium">Top-line:</span>
            <span className="font-semibold text-gray-800 text-[11.5px]">{topLineLabel}</span>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 text-[10.5px] font-medium">Structure:</span>
            <span className="font-semibold text-gray-800 text-[11.5px]">{structureLabel}</span>
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 text-[10.5px] font-medium">Geography:</span>
            <span className="font-semibold text-gray-800 text-[11.5px]">{deal.region || 'India'}</span>
          </div>
        </div>

        {/* Bottom Action Bar */}
        {isMatched && (
          <div className="flex items-center justify-end mt-2.5 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="px-3.5 py-1 bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold text-[11px] rounded-lg flex items-center gap-1.5 transition-all shadow-2xs active:scale-95"
            >
              <span>{isExpanded ? 'Hide Matches' : 'View Matches'}</span>
              <ArrowRight size={12} className={`transition-transform duration-200 ${isExpanded ? '-rotate-90' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Expandable Match Window */}
      <MatchWindow
        status={deal.status}
        matches={deal.matches}
        isOpen={isExpanded}
        onViewMatch={onViewMatch}
      />
    </div>
  );
}
