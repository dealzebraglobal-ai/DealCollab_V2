'use client';
import React, { useEffect, useState } from 'react';
import { Sparkles, Search, TrendingUp, MapPin, Building2, Shield } from 'lucide-react';
import ActionButtons from './ActionButtons';
import { useUser } from './UserProvider';
import { DealStatus } from './StatusBadge';

// ─────────────────────────────────────────────────────────────
// TYPES — matches from /api/matches
// ─────────────────────────────────────────────────────────────

export interface MatchScores {
  intent: number;
  industry: number;
  financial: number;
  niche: number;
  geography: number;
  similarity: number;
}

export interface MatchCounterparty {
  sector: string;
  subSector: string | null;
  geography: string;
  intent: string;
  structure: string | null;
  summary?: string;
}

export interface Match {
  id: string;
  rank: number;
  label: string;
  proposalId: string;
  finalScore: number;
  confidenceScore: number;
  scores: MatchScores;
  matchReason: string;
  matchArchetype?: string;
  counterparty: MatchCounterparty;
  status: string;
  createdAt: string;
}

interface MatchWindowProps {
  status: DealStatus;
  matches?: Match[];
  onViewMatch: (match: Match) => void;
  isOpen: boolean;
}

// ─────────────────────────────────────────────────────────────
// SCORE BADGE — color-coded confidence indicator
// ─────────────────────────────────────────────────────────────

import { formatMatchScore, normalizeMatchScoreNum } from '@/utils/formatters';

function ScoreBadge({ score }: { score: number }) {
  const normScore = normalizeMatchScoreNum(score);
  const color = normScore >= 80 ? 'text-[#15803D] bg-[#DCFCE7] border-[#86EFAC]'
    : normScore >= 60 ? 'text-[#1F2937] bg-[#F3F4F6] border-[#E5E7EB]'
      : 'text-gray-600 bg-gray-50 border-gray-200';

  const label = normScore >= 80 ? 'Strong' : normScore >= 60 ? 'Good' : 'Moderate';

  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${color}`}>
      <TrendingUp size={10} />
      <span>{formatMatchScore(score)} {label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function MatchWindow({ status, matches: propMatches, onViewMatch, isOpen }: MatchWindowProps) {
  const { isEOIApproved } = useUser();
  const [fetchedMatches, setFetchedMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');

  // Fetch real matches from API (only when no prop matches)
  useEffect(() => {
    if (!isOpen || propMatches) return;
    let cancelled = false;

    async function fetchMatches() {
      setLoading(true);
      try {
        const res = await fetch('/api/matches');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setFetchedMatches(data.matches || []);
          setSummary(data.summary || '');
        }
      } catch (err) {
        console.error('[MatchWindow] Fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMatches();
    return () => { cancelled = true; };
  }, [isOpen, propMatches]);

  // Derive matches: props take priority over fetched
  const matches = propMatches || fetchedMatches;
  const hasMatches = matches.length > 0;
  const isMatched = status === 'Matched' || hasMatches;

  return (
    <div
      className={`grid transition-[grid-template-rows,margin,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${isOpen ? 'grid-rows-[1fr] mt-3 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'
        }`}
    >
      <div className="min-h-0">
        <div
          className={`bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-5 shadow-sm transition-all duration-200 ease-out transform ${isOpen
              ? 'opacity-100 scale-100 translate-y-0 visible'
              : 'opacity-0 scale-[0.985] translate-y-1.5 invisible'
            }`}
        >
          {loading ? (
            <div className="flex flex-col items-center text-center py-6">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border border-[#E5E7EB] mb-4 shadow-sm">
                <Search size={22} className="text-[#FF6A00] animate-pulse" />
              </div>
              <p className="text-sm text-[#6B7280] font-medium">Analyzing counterparty intelligence...</p>
            </div>
          ) : isMatched ? (
            <>
              {/* Header with summary */}
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-[#FFF7ED] border border-[#FFEDD5] rounded-lg">
                  <Sparkles size={16} className="text-[#FF6A00]" />
                </div>
                <h4 className="text-sm font-medium text-black">
                  {matches.length} Aligned Counterpart{matches.length > 1 ? 'ies' : 'y'} Identified
                </h4>
              </div>

              {summary && (
                <p className="text-xs text-black mb-4 leading-relaxed pl-8 font-normal">{summary}</p>
              )}

              {/* Match cards */}
              <div className="space-y-3">
                {matches.map((match, index) => {
                  const matchIdNumeric = parseInt(match.id.replace(/[^0-9]/g, '').slice(0, 4)) || (index + 1) * 1000;
                  const approved = isEOIApproved(matchIdNumeric);

                  return (
                    <div
                      key={match.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white border border-[#E5E7EB] rounded-xl hover:border-black transition-all duration-200 group"
                    >
                      <div className="flex-1 min-w-0">
                        {/* Top line: rank + score */}
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-medium text-black uppercase tracking-wider bg-[#F3F4F6] border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                            {match.label || `P${index + 1}`}
                          </span>
                          <ScoreBadge score={match.finalScore} />
                          {!approved && (
                            <div className="flex items-center gap-1 text-[10px] text-black font-normal">
                              <Shield size={10} />
                              <span>Identity Protected</span>
                            </div>
                          )}
                        </div>

                        {/* Sector + Geography */}
                        <div className="flex items-center gap-3 mb-1">
                          <div className="flex items-center gap-1 text-xs text-black font-medium">
                            <Building2 size={12} className="text-black" />
                            <span>{match.counterparty.sector}</span>
                          </div>
                          {match.counterparty.geography && (
                            <div className="flex items-center gap-1 text-xs text-black font-normal">
                              <MapPin size={12} />
                              <span>{match.counterparty.geography}</span>
                            </div>
                          )}
                        </div>

                        {match.counterparty.summary && (
                          <div className="mb-2 p-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                            <p className="text-xs text-black italic line-clamp-2 font-normal">
                              &ldquo;{match.counterparty.summary}&rdquo;
                            </p>
                          </div>
                        )}

                        {/* Match reason */}
                        <p className="text-xs text-black line-clamp-2 leading-relaxed font-normal">
                          {match.matchReason}
                        </p>
                      </div>

                      <ActionButtons
                        onView={() => onViewMatch(match)}
                        label={match.label || `P${index + 1}`}
                        variant="match"
                      />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border border-[#E5E7EB] mb-4 shadow-sm">
                <Search size={22} className="text-[#FF6A00] animate-pulse" />
              </div>
              <p className="max-w-md text-sm font-normal text-[#6B7280] leading-relaxed">
                The matchmaking engine is analyzing your mandate against the network.
                <span className="block mt-1 font-medium text-[#1F1F1F]">
                  You will be notified when aligned counterparties are identified.
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
