'use client';
import React from 'react';
import { ChevronDown, Clock, ArrowRight } from 'lucide-react';
import BulkMandateMatches from './BulkMandateMatches';
import { Match } from './MatchWindow';
import { formatDealTimestamp } from '@/utils/date';

export interface BulkMandate {
  id: string;
  title: string;
  summary: string;
  industry: string;
  structure: string;
  createdAt: string;
  status: 'Searching Match' | 'Matched';
  matches: Match[];
}

interface BulkMandateCardProps {
  mandate: BulkMandate;
  isExpanded: boolean;
  onToggle: () => void;
  onSearchForMatches: (id: string) => void;
  onViewMatch: (match: Match) => void;
  searching: boolean;
}

export default function BulkMandateCard({
  mandate,
  isExpanded,
  onToggle,
  onSearchForMatches,
  onViewMatch,
  searching,
}: BulkMandateCardProps) {
  const ts = mandate.createdAt ? formatDealTimestamp(mandate.createdAt) : null;
  const isMatched = mandate.status === 'Matched' || (mandate.matches && mandate.matches.length > 0);

  return (
    <div className="w-full flex flex-col group">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        className={`border border-[#E5E7EB] hover:border-gray-300 transition-all duration-200 rounded-xl p-4 sm:px-5 sm:py-3.5 cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C] ${
          isExpanded ? 'bg-white ring-1 ring-gray-200' : 'bg-white'
        }`}
      >
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14.5px] font-bold text-[#1F2937] leading-snug">
                {mandate.title}
              </h3>
              <span className="px-1.5 py-0.2 bg-gray-100 text-gray-700 rounded text-[9.5px] font-bold uppercase tracking-wider">
                BULK
              </span>
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

          {/* Top Right Status Badge */}
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
          </div>
        </div>

        {/* Summary Description */}
        {mandate.summary && (
          <p className="text-[13px] text-gray-600 line-clamp-2 leading-relaxed font-normal mt-2">
            {mandate.summary}
          </p>
        )}

        {/* Deal Metrics Chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 text-[10.5px] font-medium">Industry:</span>
            <span className="font-semibold text-gray-800 text-[11.5px]">{mandate.industry || 'Manufacturing'}</span>
          </div>

          {mandate.structure && (
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 flex items-center gap-1.5 text-xs">
              <span className="text-gray-400 text-[10.5px] font-medium">Structure:</span>
              <span className="font-semibold text-gray-800 text-[11.5px]">{mandate.structure}</span>
            </div>
          )}
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

      <BulkMandateMatches
        isOpen={isExpanded}
        matches={mandate.matches}
        mandateSummary={mandate.summary}
        searching={searching}
        onSearchForMatches={() => onSearchForMatches(mandate.id)}
        onViewMatch={onViewMatch}
      />
    </div>
  );
}
