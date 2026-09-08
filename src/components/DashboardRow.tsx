'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import DealCard from './DealCard';
import MatchCard from './MatchCard';
import StatusButton, { DashboardStatus } from './StatusButton';
import ConnectionDetails from './ConnectionDetails';
import IncomingEOIDetails from './IncomingEOIDetails';
import { formatDealTimestamp } from '@/utils/date';

export interface DashboardDeal {
  id: string | number;
  deal: string;
  dealDesc: string;
  match: string;
  matchDesc: string;
  status: DashboardStatus;
  isIncoming?: boolean;
  counterpartyRole?: string;
  createdAt?: string;
  raw?: unknown;
}

interface DashboardRowProps {
  item: DashboardDeal;
  error?: { message: string; canBuy: boolean };
  onEOIClick?: () => void;
  onApprove?: () => void;
  onDecline?: () => void;
}

export default function DashboardRow({ item, error, onEOIClick, onApprove, onDecline }: DashboardRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleStatusClick = () => {
    const isIncoming = item.status === 'EOI Received';

    if (item.status === 'Approved' || isIncoming) {
      setIsExpanded(!isExpanded);
    } else if (item.status === 'Send EOI') {
      onEOIClick?.();
    }
  };

  const isIncoming = item.isIncoming;

  return (
    <div className={`flex flex-col border border-[#E5E7EB] hover:border-black transition-all duration-200 rounded-2xl shadow-sm ${isExpanded
        ? 'bg-white ring-1 ring-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.06)]'
        : 'bg-white'
      }`}>
      <div className="grid grid-cols-1 md:grid-cols-12 items-stretch gap-4 p-5">
        {/* YOUR DEAL (Col 5) */}
        <div className="sm:col-span-12 md:col-span-5 flex flex-col justify-between">
          <div className="text-[13px] font-semibold text-black uppercase tracking-wider mb-2.5 px-1 flex items-center justify-center gap-2 flex-wrap text-center">
            <span>{isIncoming ? 'Your Offer' : 'Your Deal'}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wider ${
              isIncoming ? 'bg-[#FFF7ED] text-[#EA580C] border border-[#FFEDD5]' : 'bg-[#F3F4F6] text-[#444746] border border-[#E5E7EB]'
            }`}>
              {isIncoming ? 'INCOMING' : 'SENT'}
            </span>
            {item.createdAt && (() => {
              const ts = formatDealTimestamp(item.createdAt);
              return (
                <span className="text-[11px] text-[#747775] font-normal normal-case bg-[#F3F4F6] border border-[#E5E7EB] px-2.5 py-0.5 rounded-full" title={ts.exact}>
                  {ts.exact} • <strong className="text-black font-medium">{ts.relative}</strong>
                </span>
              );
            })()}
          </div>
          <DealCard title={item.deal} description={item.dealDesc} />
        </div>

        {/* SELECTED MATCH / COUNTERPARTY (Col 5 - IDENTICAL SIZE TO YOUR DEAL) */}
        <div className="sm:col-span-12 md:col-span-5 flex flex-col justify-between">
          <div className="text-[13px] font-semibold text-black uppercase tracking-wider mb-2.5 px-1 text-center">
            {isIncoming ? (item.counterpartyRole || 'Counterparty') : 'AI Match'}
          </div>
          <MatchCard entity={item.match} description={item.matchDesc} />
        </div>

        {/* STATUS BUTTON (Col 2 - CENTERED) */}
        <div className="sm:col-span-12 md:col-span-2 flex flex-col justify-center items-center text-center self-center w-full">
          <StatusButton
            status={item.status}
            isOpen={isExpanded}
            onClick={handleStatusClick}
          />
        </div>
      </div>

      {/* Inline action error (e.g. insufficient tokens on approve) */}
      {error && (
        <div className="mx-5 mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
          <p className="text-xs font-medium text-red-600">{error.message}</p>
          {error.canBuy && (
            <Link
              href="/profile/billing"
              className="shrink-0 text-[11px] font-medium text-[#EA580C] uppercase tracking-wider hover:underline whitespace-nowrap"
            >
              Buy Tokens →
            </Link>
          )}
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        (isIncoming && item.status !== 'Approved') ? (
          <IncomingEOIDetails
            item={item}
            onApprove={() => {
              onApprove?.();
              setIsExpanded(false);
            }}
            onDecline={() => {
              onDecline?.();
              setIsExpanded(false);
            }}
          />
        ) : (
          // Approved (either direction) OR outbound -> connected view with the counterparty's contact.
          <ConnectionDetails item={item} />
        )
      )}
    </div>
  );
}