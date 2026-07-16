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
        className={`cursor-pointer bg-white border transition-all duration-300 rounded-xl px-5 py-4 shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] ${isExpanded ? 'border-[rgba(17,17,17,0.12)] bg-[#F5F5F3] ring-1 ring-[rgba(17,17,17,0.04)]' : 'border-[rgba(17,17,17,0.08)]'
          }`}
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex flex-col gap-1.5 flex-1 pr-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-foreground leading-none group-hover:text-primary-hover transition-colors">
                {mandate.title}
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500">
                Bulk
              </span>
            </div>

            {mandate.summary && (
              <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
                {mandate.summary}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-[11px] text-gray-500 font-semibold">
                <Building2 size={12} />
                <span>{mandate.industry}</span>
              </div>
              {mandate.structure && (
                <div className="flex items-center gap-1 text-[11px] text-gray-500 font-semibold">
                  <Layers size={12} />
                  <span>{mandate.structure}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                <Calendar size={12} />
                <span>{createdLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border shadow-sm transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] hover:brightness-105 ${mandate.status === 'Matched'
                ? 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'
                : 'bg-primary-soft text-primary-hover border-primary/20 hover:bg-primary/20'
                }`}
            >
              <span>{mandate.status === 'Matched' ? 'View Matches' : 'Search For Matches'}</span>
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
