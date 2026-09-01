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
        className={`bg-white border transition-all duration-300 rounded-xl px-5 py-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:bg-gray-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] ${
          isExpanded
            ? 'border-[rgba(17,17,17,0.12)] bg-[#F5F5F3] ring-1 ring-[rgba(17,17,17,0.04)] hover:bg-[#F5F5F3]'
            : 'border-[rgba(17,17,17,0.08)]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex flex-col gap-1.5 flex-1 pr-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-foreground leading-none group-hover:text-primary-hover transition-colors">
                {deal.deal}
              </h3>
              {ts && (
                <span className="text-[10px] text-gray-500 font-semibold bg-gray-50 border border-gray-200/60 px-2 py-0.5 rounded-lg" title={ts.exact}>
                  {ts.exact} • <strong className="text-gray-700">{ts.relative}</strong>
                </span>
              )}
              {deal.isNew && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-primary text-foreground animate-pulse">
                  New
                </span>
              )}
            </div>

            {deal.summary && (
              <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
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
