'use client';
import React, { useEffect, useState } from 'react';
import { X, Info, Building2, Lock, TrendingUp, BarChart3, Target, Briefcase, MapPin, Search } from 'lucide-react';
import { formatMatchScore } from '@/utils/formatters';
import { useUser } from './UserProvider';
import type { Match } from './MatchWindow';

interface MatchDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match | null;
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
  const [detailedData, setDetailedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDetailedData(null);
      return;
    }
    const resolvedId = match?.id || matchId;
    if (!resolvedId) return;

    let mounted = true;
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/matches/detail/${resolvedId}`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.success) {
            setDetailedData(data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch match details', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchDetail();
    return () => { mounted = false; };
  }, [isOpen, match, matchId]);

  if (!isOpen) return null;

  const finalScore = detailedData?.match?.finalScore ?? match?.finalScore ?? 0;
  const confidenceScore = match?.confidenceScore ?? 0;
  const scores = match?.scores;
  
  const cp = detailedData?.counterparty;
  const reason = detailedData?.match?.matchReason || match?.matchReason || matchDescription || '';
  const sector = cp?.sectors?.[0] || match?.counterparty?.sector || 'Undisclosed';
  const geography = cp?.geographies?.[0] || match?.counterparty?.geography || 'India';
  const intent = cp?.intent || match?.counterparty?.intent || 'Undisclosed';
  const structure = cp?.dealStructure || match?.counterparty?.structure;
  
  const resolvedId = match?.id || matchId || '';
  const matchIdNumeric = resolvedId ? parseInt(resolvedId.replace(/[^0-9]/g, '').slice(0, 4)) || 0 : 0;
  const approved = isEOIApproved(matchIdNumeric);
  const displayName = approved ? (matchName || `${sector} Counterparty`) : 'Strategic Partner';

  const scoreColor = finalScore >= 80 ? 'text-emerald-700' : finalScore >= 60 ? 'text-amber-700' : 'text-gray-600';
  const scoreLabel = finalScore >= 80 ? 'Strong Alignment' : finalScore >= 60 ? 'Good Compatibility' : 'Moderate Alignment';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-[#E5E7EB] animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#E5E7EB] bg-[#F9FAFB] shrink-0">
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
        <div className="p-6 overflow-y-auto">
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

          {loading && !detailedData ? (
             <div className="flex flex-col items-center justify-center py-10">
               <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-[#E5E7EB] mb-3 shadow-sm">
                 <Search size={20} className="text-[#FF6A00] animate-pulse" />
               </div>
               <p className="text-sm text-[#6B7280] font-medium">Fetching detailed intelligence...</p>
             </div>
          ) : (
            <>
              {/* Score overview */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-100">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs uppercase mb-1">
                    <TrendingUp size={12} />
                    <span>Compatibility</span>
                  </div>
                  <div className={`text-2xl font-black ${scoreColor}`}>{formatMatchScore(finalScore)}</div>
                  <div className="text-[10px] text-gray-500 font-medium">{scoreLabel}</div>
                </div>
                <div className="p-3 bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100">
                  <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs uppercase mb-1">
                    <Target size={12} />
                    <span>Confidence</span>
                  </div>
                  <div className="text-2xl font-black text-blue-700">{formatMatchScore(confidenceScore || (finalScore * 0.9))}</div>
                  <div className="text-[10px] text-gray-500 font-medium">
                    {confidenceScore >= 75 || finalScore >= 80 ? 'High' : 'Medium'} Confidence
                  </div>
                </div>
              </div>

              {/* Counterparty Profile */}
              <div className="bg-[#F9FAFB] p-5 rounded-xl border border-[#E5E7EB] mb-5">
                <div className="flex items-center gap-2 mb-4 border-b pb-2">
                  <Building2 size={16} className="text-[#6B7280]" />
                  <span className="text-sm font-bold text-[#1F2937]">Counterparty Profile</span>
                </div>
                
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {/* Deal Structure */}
                  <div>
                    <h5 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Deal Structure</h5>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-500">Intent</span>
                        <span className="font-semibold text-gray-900 capitalize">{intent.replace(/_/g, ' ')}</span>
                      </div>
                      {structure && (
                        <div className="flex justify-between border-b border-gray-100 pb-1">
                          <span className="text-gray-500">Structure</span>
                          <span className="font-semibold text-gray-900 capitalize">{structure.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {(cp?.dealSizeMinCr || cp?.dealSizeMaxCr || match?.counterparty?.sizeRange) && (
                        <div className="flex justify-between border-b border-gray-100 pb-1">
                          <span className="text-gray-500">Deal Size</span>
                          <span className="font-semibold text-gray-900">
                            {cp?.dealSizeMinCr && cp?.dealSizeMaxCr ? `₹${cp.dealSizeMinCr}-${cp.dealSizeMaxCr} Cr` : cp?.dealSizeMinCr ? `₹${cp.dealSizeMinCr} Cr` : cp?.dealSizeMaxCr ? `₹${cp.dealSizeMaxCr} Cr` : match?.counterparty?.sizeRange}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Industry & Geography */}
                  <div>
                    <h5 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Industry & Geography</h5>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-500">Sector</span>
                        <span className="font-semibold text-gray-900 capitalize">{sector}</span>
                      </div>
                      {cp?.industry && (
                        <div className="flex justify-between border-b border-gray-100 pb-1">
                          <span className="text-gray-500">Industry</span>
                          <span className="font-semibold text-gray-900 capitalize">{cp.industry}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-500">Geography</span>
                        <span className="font-semibold text-gray-900 capitalize">{geography}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Financial Information */}
                  {(cp?.revenueMinCr || cp?.revenueMaxCr || match?.counterparty?.revenueRange) && (
                    <div>
                      <h5 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Financials</h5>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between border-b border-gray-100 pb-1">
                          <span className="text-gray-500">Revenue</span>
                          <span className="font-semibold text-gray-900">
                            {cp?.revenueMinCr && cp?.revenueMaxCr ? `₹${cp.revenueMinCr}-${cp.revenueMaxCr} Cr` : cp?.revenueMinCr ? `₹${cp.revenueMinCr}+ Cr` : cp?.revenueMaxCr ? `Up to ₹${cp.revenueMaxCr} Cr` : match?.counterparty?.revenueRange}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Business Attributes */}
                  {cp?.businessData && cp.businessData.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Business Details</h5>
                      <div className="space-y-1.5 text-xs">
                        {cp.businessData.slice(0, 4).map((attr: any) => (
                          <div key={attr.key} className="flex justify-between border-b border-gray-100 pb-1">
                            <span className="text-gray-500">{attr.label}</span>
                            <span className="font-semibold text-gray-900 text-right">{attr.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Strategic Rationale */}
              {reason && (
                <div className="bg-[#F9FAFB] p-5 rounded-xl border border-[#E5E7EB] mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Target size={16} className="text-[#F97316]" />
                    <span className="text-sm font-bold text-[#1F2937]">Strategic Rationale</span>
                  </div>
                  <div className="text-xs font-bold text-[#F97316] mb-1.5 uppercase tracking-wide">
                    {detailedData?.match?.matchArchetype || match?.matchArchetype || 'Adjacency Match'}
                  </div>
                  <p className="text-sm text-[#4B5563] leading-relaxed">{reason}</p>
                </div>
              )}

              {/* Synergy Breakdown (if available) */}
              {detailedData?.synergy && (
                <div className="bg-[#F9FAFB] p-5 rounded-xl border border-[#E5E7EB] mb-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={16} className="text-[#6B7280]" />
                    <span className="text-sm font-bold text-[#1F2937]">Match Analysis</span>
                  </div>
                  <div className="space-y-2">
                    {detailedData.synergy.map((syn: any, idx: number) => (
                      <div key={idx} className="flex gap-3 text-xs bg-white p-2.5 rounded border border-gray-100">
                        <span className="text-gray-500 font-medium w-20 shrink-0">{syn.aspect}</span>
                        <span className={`font-semibold flex-1 ${syn.status === 'Match' ? 'text-emerald-700' : syn.status === 'Partial' ? 'text-amber-700' : 'text-gray-900'}`}>
                          {syn.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Full M&A Deal Intelligence Brief */}
              {(() => {
                const rawSummary = cp?.teaser || match?.dealSummary || match?.counterparty?.dealSummary || match?.counterparty?.summary;
                if (!rawSummary) return null;

                const paragraphs = rawSummary
                  .split('\n\n')
                  .map((p: string) => p.trim())
                  .filter(Boolean);

                return (
                  <div className="bg-[#F9FAFB] p-5 rounded-xl border border-[#E5E7EB] mb-5">
                    <div className="flex items-center gap-2 mb-4 border-b pb-2">
                      <Info size={16} className="text-[#FF6A00]" />
                      <span className="text-sm font-bold text-[#1F2937]">M&A Deal Intelligence Brief</span>
                    </div>
                    <div className="space-y-4 text-xs text-gray-700 leading-relaxed">
                      {paragraphs.map((paragraph: string, idx: number) => {
                        const lines = paragraph.split('\n');
                        const firstLine = lines[0].trim();
                        const isHeading = firstLine.startsWith('###') || firstLine.startsWith('##');
                        const headingText = isHeading ? firstLine.replace(/^#+\s*/, '') : null;
                        const bodyText = isHeading ? lines.slice(1).join(' ').trim() : lines.join(' ').trim();

                        return (
                          <div key={idx} className="space-y-1.5">
                            {headingText && (
                              <h4 className="text-xs font-bold tracking-wider uppercase text-gray-900 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] inline-block" />
                                {headingText}
                              </h4>
                            )}
                            {bodyText && (
                              <p className="text-gray-600 font-normal leading-relaxed pl-3.5 border-l-2 border-orange-100">
                                {bodyText}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F9FAFB] border-t border-[#E5E7EB] flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#E5E7EB] bg-white rounded-lg text-sm font-bold text-[#6B7280] hover:bg-gray-50 transition-all"
          >
            Back to List
          </button>
          {!approved && (
            <button className="flex-1 px-4 py-2.5 bg-[#F97316] text-white rounded-lg text-sm font-bold hover:bg-[#EA580C] shadow-sm transition-all">
              Send Connection Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
