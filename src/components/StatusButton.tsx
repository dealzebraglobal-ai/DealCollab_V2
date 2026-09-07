'use client';
import React from 'react';
import { DealStatus } from './StatusBadge';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useUser } from './UserProvider';

export type DashboardStatus = 
  | 'Send EOI' 
  | 'EOI Sent — Awaiting Approval' 
  | 'Approved' 
  | 'Declined' 
  | 'Expired'
  | 'EOI Received';

interface StatusButtonProps {
  status: DealStatus | DashboardStatus;
  isOpen?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export default function StatusButton({ status, isOpen, onClick }: StatusButtonProps) {
  const { canSendEOI } = useUser();

  // Deal Log Statuses (Toggles)
  if (status === 'Matched' || status === 'Searching Match') {
    const isMatched = status === 'Matched';
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border shadow-sm transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] ${
          isMatched 
            ? 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC] hover:bg-[#BBF7D0]' 
            : 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB] hover:bg-[#E5E7EB]'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {isMatched && <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />}
          {status}
        </span>
        {isOpen !== undefined && (isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </button>
    );
  }

  // Dashboard Statuses (Actions)
  let label: string = status;
  let colorClass = '';
  let isClickable = true;
  let showLock = false;

  switch (status) {
    case 'Send EOI':
      if (!canSendEOI) {
        label = 'Insufficient Tokens';
        colorClass = 'bg-[#F3F4F6] text-[#747775] cursor-not-allowed border border-[#E5E7EB]';
        isClickable = false;
        showLock = true;
      } else {
        colorClass = 'bg-[#FF6A00] text-white hover:bg-[#E65C00] cursor-pointer shadow-md shadow-orange-500/20';
      }
      break;

    case 'EOI Sent — Awaiting Approval':
      label = 'Awaiting Approval';
      colorClass = 'bg-[#F3F4F6] text-[#4B5563] cursor-not-allowed border border-[#E5E7EB] opacity-90';
      isClickable = false;
      break;

    case 'Approved':
      label = 'Connected';
      colorClass = 'bg-[#16A34A] text-white hover:bg-[#15803D] cursor-pointer shadow-md shadow-green-600/20';
      isClickable = true;
      break;

    case 'Declined':
      colorClass = 'bg-red-50 text-red-600 cursor-not-allowed border border-red-200 opacity-70';
      isClickable = false;
      break;

    case 'Expired':
      colorClass = 'bg-gray-100 text-gray-500 cursor-not-allowed border border-gray-200 opacity-60';
      isClickable = false;
      break;

    case 'EOI Received':
      label = 'Review Proposal';
      colorClass = 'bg-[#FF6A00] text-white hover:bg-[#E65C00] cursor-pointer shadow-md shadow-orange-500/20';
      isClickable = true;
      break;

    default:
      return null;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        disabled={!isClickable}
        onClick={(e) => {
          if (!isClickable) return;
          if (onClick) {
            onClick(e);
          } else {
            window.location.href = status === 'Approved' ? '/connect' : '#';
          }
        }}
        className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-medium uppercase tracking-wider transition-all active:scale-95 shadow-sm whitespace-nowrap min-w-[140px] ${colorClass}`}
      >
        {showLock && <Lock size={12} />}
        {label}
      </button>
      
      {status === 'Send EOI' && !canSendEOI && (
        <a 
          href="/profile/billing" 
          className="text-[10px] font-medium text-[#FF6A00] hover:underline"
        >
          Buy Tokens →
        </a>
      )}
    </div>
  );
}
