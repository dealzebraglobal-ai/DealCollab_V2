'use client';
import React from 'react';
import StatusButton from './StatusButton';
import { DealStatus } from './StatusBadge';
import MatchWindow, { Match } from './MatchWindow';
import ActionButtons from './ActionButtons';
import { formatDealTimestamp } from '@/utils/date';

interface DealLogCardProps {
  deal: {
    id: string | number;
    deal: string;
    status: DealStatus;
    matches: Match[];
    isNew?: boolean;
    isConnectionActive?: boolean;
    summary?: string;
    createdAt?: string;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onViewMatch: (match: Match) => void;
  onConnectMatch?: (match: Match) => void;
}

export default function DealLogCard({
  deal,
  isExpanded,
  onToggle,
  onDelete,
  onViewMatch,
}: DealLogCardProps) {
  const ts = deal.createdAt ? formatDealTimestamp(deal.createdAt) : null;

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
        className={`border border-[#E5E7EB] hover:border-black transition-all duration-200 rounded-2xl p-6 sm:px-8 sm:py-6 cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] ${
          isExpanded
            ? 'bg-[#F9FAFB] ring-1 ring-black/5'
            : 'bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex flex-col gap-2 flex-1 pr-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-[17px] font-medium text-black leading-snug transition-colors">
                {deal.deal}
              </h3>
              {ts && (
                <span className="text-[11px] text-black font-normal bg-[#F3F4F6] border border-[#E5E7EB] px-2.5 py-0.5 rounded-full" title={ts.exact}>
                  {ts.exact} • <strong className="text-black font-medium">{ts.relative}</strong>
                </span>
              )}
              {deal.isNew && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-[#FF6A00] text-white">
                  New
                </span>
              )}
            </div>

            {deal.summary && (
              <p className="text-sm text-black line-clamp-3 leading-relaxed font-normal">
                {deal.summary}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div onClick={(e) => e.stopPropagation()}>
              <ActionButtons
                onDelete={onDelete}
                variant="deal"
                isDeleteDisabled={deal.isConnectionActive}
              />
            </div>

            <div onClick={(e) => { e.stopPropagation(); onToggle(); }}>
              <StatusButton
                status={deal.status}
                isOpen={isExpanded}
              />
            </div>
          </div>
        </div>
      </div>

      <MatchWindow
        status={deal.status}
        matches={deal.matches}
        isOpen={isExpanded}
        onViewMatch={onViewMatch}
      />
    </div>
  );
}
