'use client';
import React from 'react';
import { ChevronDown, ChevronUp, Calendar, Building2, Layers } from 'lucide-react';
import BulkMandateMatches from './BulkMandateMatches';
import { Match } from './MatchWindow';

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
  const createdLabel = new Date(mandate.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="w-full flex flex-col group">
      <div
        onClick={onToggle}
        className={`cursor-pointer border border-[#E5E7EB] hover:border-black transition-all duration-200 rounded-2xl p-6 sm:px-8 sm:py-6 shadow-sm ${
          isExpanded ? 'bg-[#F9FAFB] ring-1 ring-black/5' : 'bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex flex-col gap-2 flex-1 pr-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-[17px] font-medium text-black leading-snug transition-colors">
                {mandate.title}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[#F3F4F6] text-black border border-[#E5E7EB]">
                Bulk
              </span>
            </div>

            {mandate.summary && (
              <p className="text-sm text-black line-clamp-3 leading-relaxed font-normal">
                {mandate.summary}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-xs text-black font-normal">
                <Building2 size={12} />
                <span>{mandate.industry}</span>
              </div>
              {mandate.structure && (
                <div className="flex items-center gap-1 text-xs text-black font-normal">
                  <Layers size={12} />
                  <span>{mandate.structure}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-black font-normal">
                <Calendar size={12} />
                <span>{createdLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium border shadow-sm transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] ${
                mandate.status === 'Matched'
                  ? 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC] hover:bg-[#BBF7D0]'
                  : 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB] hover:bg-[#E5E7EB]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {mandate.status === 'Matched' && <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />}
                {mandate.status === 'Matched' ? 'View Matches' : 'Search For Matches'}
              </span>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
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
