'use client';
import React from 'react';
import { CheckCircle2, FileText, User, Zap, Info } from 'lucide-react';

interface IncomingEOIDetailsProps {
  item: {
    deal: string;
    dealDesc: string;
    match: string;
    matchDesc: string;
    raw?: any;
  };
  onApprove: () => void;
  onDecline: () => void;
}

const formatSize = (min: any, max: any) => {
  if (!min && !max) return 'Undisclosed';
  const minVal = min ? Number(min) : null;
  const maxVal = max ? Number(max) : null;
  if (minVal && maxVal && minVal !== maxVal) return `₹${minVal}–${maxVal} Cr`;
  return `₹${maxVal || minVal} Cr`;
};

const intentLabel = (intent?: string) => {
  switch (intent) {
    case 'BUY_SIDE': return 'Acquisition / Investment';
    case 'SELL_SIDE': return 'Divestment / Sale';
    case 'FUNDRAISING': return 'Equity Fundraising';
    case 'DEBT': return 'Debt Financing';
    case 'STRATEGIC_PARTNERSHIP': return 'Strategic Partnership';
    default: return intent || 'Strategic Transaction';
  }
};

export default function IncomingEOIDetails({ item, onApprove, onDecline }: IncomingEOIDetailsProps) {
  const rawEoi = item.raw;
  // Blind counterparty + deterministic synergy come from /api/eois (server-enforced, no identity).
  const cp = rawEoi?.counterparty;
  const synergy = rawEoi?.synergy;
  const role = rawEoi?.counterpartyRole || 'Counterparty';

  const sectors = (cp?.sectors || []).join(', ') || 'N/A';
  const geographies = (cp?.geographies || []).join(', ') || 'Undisclosed';

  return (
    <div className="bg-white border-t border-[#E5E7EB] p-6 sm:p-8 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

        {/* Left: Engagement Profile */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#F97316]" />
              <h4 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">{role}</h4>
            </div>
            {synergy?.alignmentBand && (
              <div className="bg-[#F97316]/10 text-[#F97316] text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider">
                {synergy.alignmentBand} Alignment
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Intent</p>
                <p className="text-sm font-bold text-[#1F2937]">{intentLabel(cp?.intent)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Scale / Capacity</p>
                <p className="text-sm font-bold text-[#1F2937]">{formatSize(cp?.dealSizeMinCr, cp?.dealSizeMaxCr)}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Profile</p>
              <p className="text-xs text-[#6B7280] leading-relaxed font-medium">
                Sector: {sectors}. Geography: {geographies}.
                {cp?.industry ? ` Focus: ${cp.industry}.` : ''}
                {cp?.dealStructure ? ` Structure: ${cp.dealStructure}.` : ''}
              </p>
            </div>

            {synergy && (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Synergy Assessment</p>
                <p className="text-xs text-[#1F2937] leading-relaxed font-medium">{synergy.comment}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Sector</p>
                    <p className="text-[11px] font-medium text-gray-700">{synergy.sectorFit}</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Financial</p>
                    <p className="text-[11px] font-medium text-gray-700">{synergy.financialFit}</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Geography</p>
                    <p className="text-[11px] font-medium text-gray-700">{synergy.geographyFit}</p>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-[#F97316]">
                  <Zap size={10} /> Assessment derived from your mandate vs the counterparty&apos;s — identity stays hidden until approval.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Security & Actions */}
        <div className="flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <User size={16} className="text-[#F97316]" />
              <h4 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">Identity Status</h4>
            </div>

            <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl">
              <div className="flex items-start gap-4 mb-4">
                <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 font-medium leading-relaxed">
                  The counterparty&apos;s name and contact details are hidden. By clicking &quot;Approve&quot;, you unlock
                  mutual identity and direct communication channels. Both parties are charged on approval.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 opacity-40 grayscale pointer-events-none select-none">
                <div className="h-8 bg-white/50 rounded-lg"></div>
                <div className="h-8 bg-white/50 rounded-lg"></div>
              </div>
            </div>
          </div>

          <div className="mt-10 sm:mt-0 pt-10 border-t border-gray-100 flex flex-col gap-3">
            <button
              onClick={onApprove}
              className="w-full flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg hover:bg-green-700 transition-all active:scale-95"
            >
              <CheckCircle2 size={18} /> Approve — Unlock Contact
            </button>
            <button
              onClick={onDecline}
              className="w-full py-4 bg-white text-[#6B7280] border border-[#E5E7EB] rounded-xl text-sm font-black uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-95"
            >
              Decline Interest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}