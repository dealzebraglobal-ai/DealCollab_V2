'use client';
import React from 'react';
import { UploadCloud, Search, Loader2 } from 'lucide-react';
import MatchWindow, { Match } from './MatchWindow';

interface BulkMandateMatchesProps {
  isOpen: boolean;
  matches: Match[];
  mandateSummary: string;
  searching: boolean;
  onSearchForMatches: () => void;
  onViewMatch: (match: Match) => void;
}

// Bulk-mandate detail panel: same MatchWindow used by chat mandates when
// matches exist (Case 5), otherwise the "no matches yet" state with a manual
// Search For Matches trigger (Case 4). Reuses the existing matching UI —
// nothing here re-implements scoring or match rendering.
export default function BulkMandateMatches({
  isOpen,
  matches,
  mandateSummary,
  searching,
  onSearchForMatches,
  onViewMatch,
}: BulkMandateMatchesProps) {
  const hasMatches = matches.length > 0;

  return (
    <div
      className={`grid transition-[grid-template-rows,margin,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${isOpen ? 'grid-rows-[1fr] mt-3 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'
        }`}
    >
      <div className="min-h-0">
        {hasMatches ? (
          <MatchWindow status="Matched" matches={matches} isOpen={isOpen} onViewMatch={onViewMatch} />
        ) : (
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-gray-100 mb-4">
                <UploadCloud size={28} className="text-[#F97316]" />
              </div>
              <h4 className="text-sm font-black text-[#1F2937] mb-1">No Matches Found Yet</h4>
              {mandateSummary && (
                <div className="mt-3 mb-4 p-3 bg-white border border-gray-100 rounded-xl max-w-md">
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{mandateSummary}</p>
                </div>
              )}
              <button
                onClick={onSearchForMatches}
                disabled={searching}
                className="flex items-center gap-2 bg-[#F97316] text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-[#EA580C] transition-all active:scale-95 shadow-md shadow-[#F97316]/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {searching ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search size={14} />
                    Search For Matches
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
