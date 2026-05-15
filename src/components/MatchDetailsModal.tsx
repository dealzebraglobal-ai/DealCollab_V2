'use client';
import React from 'react';
import { X, Info, Building2, Lock, TrendingUp, BarChart3, Target } from 'lucide-react';
import { useUser } from './UserProvider';
import type { Match } from './MatchWindow';

interface MatchDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match | null;
  // Legacy compat
  matchName?: string;
  matchDescription?: string;
  matchId?: string;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, Math.round(value * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#6B7280] font-medium w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-[#1F2937] w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function MatchDetailsModal({ isOpen, onClose, match, matchName, matchDescription, matchId }: MatchDetailsModalProps) {
  const { isEOIApproved } = useUser();
  if (!isOpen) return null;

  // Support both new Match object and legacy props
  const finalScore = match?.finalScore ?? 0;
  const confidenceScore = match?.confidenceScore ?? 0;
  const scores = match?.scores;
  const reason = match?.matchReason || matchDescription || '';
  const sector = match?.counterparty?.sector || 'Undisclosed';
  const geography = match?.counterparty?.geography || 'India';
  const intent = match?.counterparty?.intent || 'Undisclosed';
  const structure = match?.counterparty?.structure;

  const resolvedId = match?.id || matchId || '';
  const matchIdNumeric = resolvedId ? parseInt(resolvedId.replace(/[^0-9]/g, '').slice(0, 4)) || 0 : 0;
  const approved = isEOIApproved(matchIdNumeric);
  const displayName = approved ? (matchName || `${sector} Counterparty`) : 'Strategic Partner';

  const scoreColor = finalScore >= 80 ? 'text-emerald-700' : finalScore >= 60 ? 'text-amber-700' : 'text-gray-600';
  const scoreLabel = finalScore >= 80 ? 'Strong Alignment' : finalScore >= 60 ? 'Good Compatibility' : 'Moderate Alignment';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-[#E5E7EB] animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#E5E7EB] bg-[#F9FAFB]">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-[#F97316]" />
            <h3 className="text-lg font-bold text-[#1F2937]">Match Intelligence</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6B7280] hover:text-[#1F2937] hover:bg-gray-100 rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Identity section */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-xs font-bold text-[#F97316] uppercase tracking-widest">Qualified Match</h4>
              {!approved && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-500 font-bold">
                  <Lock size={10} />
                  <span>Identity Protected</span>
                </div>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-[#1F2937] leading-tight">{displayName}</h2>
          </div>

          {/* Score overview */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="p-3 bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-100">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs uppercase mb-1">
                <TrendingUp size={12} />
                <span>Compatibility</span>
              </div>
              <div className={`text-2xl font-black ${scoreColor}`}>{finalScore.toFixed(0)}%</div>
              <div className="text-[10px] text-gray-500 font-medium">{scoreLabel}</div>
            </div>
            <div className="p-3 bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100">
              <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs uppercase mb-1">
                <Target size={12} />
                <span>Confidence</span>
              </div>
              <div className="text-2xl font-black text-blue-700">{confidenceScore.toFixed(0)}%</div>
              <div className="text-[10px] text-gray-500 font-medium">
                {confidenceScore >= 75 ? 'High' : confidenceScore >= 50 ? 'Medium' : 'Low'} Confidence
              </div>
            </div>
          </div>

          {/* Scoring breakdown */}
          {scores && (
            <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB] mb-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-[#6B7280]" />
                <span className="text-sm font-bold text-[#1F2937]">Scoring Breakdown</span>
              </div>
              <div className="space-y-2.5">
                <ScoreBar label="Intent" value={scores.intent} color="bg-[#F97316]" />
                <ScoreBar label="Industry" value={scores.industry} color="bg-blue-500" />
                <ScoreBar label="Financial" value={scores.financial} color="bg-emerald-500" />
                <ScoreBar label="Niche" value={scores.niche} color="bg-purple-500" />
                {scores.geography > 0 && (
                  <ScoreBar label="Geography" value={scores.geography} color="bg-amber-500" />
                )}
              </div>
            </div>
          )}

          {/* Counterparty details */}
          <div className="space-y-3">
            <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB]">
              <div className="flex items-center gap-2 mb-2">
                <Info size={14} className="text-[#6B7280]" />
                <span className="text-sm font-bold text-[#1F2937]">Counterparty Profile</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[#6B7280]">Sector:</span>{' '}
                  <span className="font-semibold text-[#1F2937]">{sector}</span>
                </div>
                <div>
                  <span className="text-[#6B7280]">Geography:</span>{' '}
                  <span className="font-semibold text-[#1F2937]">{geography}</span>
                </div>
                <div>
                  <span className="text-[#6B7280]">Intent:</span>{' '}
                  <span className="font-semibold text-[#1F2937]">{intent.replace('_', ' ')}</span>
                </div>
                {structure && (
                  <div>
                    <span className="text-[#6B7280]">Structure:</span>{' '}
                    <span className="font-semibold text-[#1F2937]">{structure}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Strategic Rationale */}
            <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB]">
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} className="text-[#F97316]" />
                <span className="text-sm font-bold text-[#1F2937]">Strategic Rationale</span>
              </div>
              <div className="text-xs font-bold text-[#F97316] mb-1 uppercase tracking-wide">
                {match?.matchArchetype || 'Adjacency Match'}
              </div>
              <p className="text-sm text-[#6B7280] leading-relaxed">{reason}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F9FAFB] border-t border-[#E5E7EB] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#E5E7EB] bg-white rounded-lg text-sm font-bold text-[#6B7280] hover:bg-gray-50 transition-all"
          >
            Back to List
          </button>
          <button className="flex-1 px-4 py-2.5 bg-[#F97316] text-white rounded-lg text-sm font-bold hover:bg-[#EA580C] shadow-sm transition-all">
            Send Connection Request
          </button>
        </div>
      </div>
    </div>
  );
}
