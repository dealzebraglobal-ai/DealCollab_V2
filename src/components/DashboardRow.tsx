'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import DealCard from './DealCard';
import MatchCard from './MatchCard';
import StatusButton, { DashboardStatus } from './StatusButton';
import ConnectionDetails from './ConnectionDetails';
import IncomingEOIDetails from './IncomingEOIDetails';

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
  onRemove?: () => void;
}

export default function DashboardRow({ item, error, onEOIClick, onApprove, onDecline, onRemove }: DashboardRowProps) {
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
    <div className={`flex flex-col border transition-all duration-300 rounded-2xl shadow-sm ${isExpanded
        ? 'border-[rgba(17,17,17,0.12)] bg-white ring-1 ring-[rgba(17,17,17,0.04)] shadow-[0_8px_30px_rgb(0,0,0,0.06)]'
        : isIncoming
          ? 'bg-white border-[#FF6A00]/30 ring-1 ring-[#FF6A00]/10 shadow-[0_4px_20px_rgb(0,0,0,0.04)]'
          : 'bg-[#F5F5F3] border-[rgba(17,17,17,0.08)] hover:bg-white hover:border-[rgba(17,17,17,0.12)] hover:shadow-[0_4px_15px_rgb(0,0,0,0.03)]'
      }`}>
      <div className="grid grid-cols-1 sm:grid-cols-12 items-stretch gap-4 p-4">
        {/* YOUR DEAL */}
        <div className="sm:col-span-12 md:col-span-5 flex flex-col">
          <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest mb-2 px-1 flex items-center gap-2">
            {isIncoming ? 'Your Offer' : 'Your Deal'}
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider ${isIncoming ? 'bg-[#F97316]/10 text-[#F97316]' : 'bg-blue-50 text-blue-600'
              }`}>
              {isIncoming ? 'INCOMING' : 'SENT'}
            </span>
          </div>
          <DealCard title={item.deal} description={item.dealDesc} />
        </div>

        {/* SELECTED MATCH */}
        <div className="sm:col-span-12 md:col-span-4 flex flex-col">
          <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest mb-2 px-1">
            {isIncoming ? (item.counterpartyRole || 'Counterparty') : 'AI match'}
          </div>
          <MatchCard entity={item.match} description={item.matchDesc} />
        </div>

        {/* STATUS BUTTON */}
        <div className="sm:col-span-12 md:col-span-3 flex flex-col justify-center items-center md:items-end md:pt-6 gap-2">
          <StatusButton
            status={item.status}
            isOpen={isExpanded}
            onClick={handleStatusClick}
          />
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-[10px] font-bold text-gray-400 hover:text-red-500 transition-all uppercase tracking-wider mt-1"
            >
              Remove Match
            </button>
          )}
        </div>
      </div>

      {/* Inline action error (e.g. insufficient tokens on approve) */}
      {error && (
        <div className="mt-3 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
          <p className="text-xs font-bold text-red-600">{error.message}</p>
          {error.canBuy && (
            <Link
              href="/profile/billing"
              className="shrink-0 text-[11px] font-black text-[#F97316] uppercase tracking-widest hover:underline whitespace-nowrap"
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