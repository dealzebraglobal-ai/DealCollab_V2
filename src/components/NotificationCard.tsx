'use client';
import React from 'react';
import { Bell, ArrowRight, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export type NotificationType =
  | 'match'
  | 'new_counterparty'
  | 'eoi_approval_blocked'
  | 'eoi_received'
  | 'eoi_approved'
  | 'eoi_declined'
  | 'tokens_credited'
  | 'tokens_low'
  | 'status'
  | 'new_deal'
  | 'success'
  | 'error';

export interface Notification {
  id: number | string;
  type: NotificationType;
  message: string;
  time: string;       // relative, e.g. "5 minutes ago" — from the centralized src/utils/date.ts
  exactTime?: string | null; // exact, e.g. "18 Sep 2026, 3:06 PM" — shown as a tooltip on the relative time
  isRead: boolean;
  matchId?: string | null;   // present on NEW_COUNTERPARTY alerts; deep-links to /deal-log/[id] (id = proposal_matches.id)
  proposalId?: string | null;
  metadata?: any;
}

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (id: number | string) => void;
}

// Fallback routes used when a notification has no specific deep-link target.
const typeRoutes: Record<NotificationType, string> = {
  match: '/deal-dashboard',
  new_counterparty: '/deal-dashboard',
  eoi_approval_blocked: '/profile/billing',
  eoi_received: '/eoi-activities',
  eoi_approved: '/eoi-activities',
  eoi_declined: '/eoi-activities',
  tokens_credited: '/profile/tokens',
  tokens_low: '/profile/billing',
  status: '/deal-log',
  new_deal: '/deal-dashboard',
  success: '/deal-dashboard',
  error: '/deal-dashboard',
};

export default function NotificationCard({ notification, onMarkAsRead }: NotificationCardProps) {
  const router = useRouter();

  // Extract Mandate Reference ID (e.g., #0C4C23, #47D999)
  const extractRef = () => {
    if (notification.metadata?.subject_ref) return notification.metadata.subject_ref;
    const match = notification.message.match(/#([A-Za-z0-9_-]{4,10})/);
    if (match) return match[0];
    if (notification.matchId) return `#${String(notification.matchId).slice(-6).toUpperCase()}`;
    if (notification.id) return `#${String(notification.id).slice(-6).toUpperCase()}`;
    return null;
  };

  // Extract Intent / Category Label
  const extractIntent = () => {
    // New-match alerts always lead with a clear "NEW MATCH FOUND" heading rather than the
    // mandate's own intent label (e.g. "SELL-SIDE"), which used to get picked up from the
    // message body below and made every match alert look like a generic mandate update.
    if (notification.type === 'new_counterparty' || notification.type === 'match') {
      return 'NEW MATCH FOUND';
    }
    const msg = notification.message.toUpperCase();
    if (msg.includes('SELL-SIDE') || msg.includes('SELL_SIDE') || msg.includes('SELL SIDE')) return 'SELL-SIDE';
    if (msg.includes('BUY-SIDE') || msg.includes('BUY_SIDE') || msg.includes('BUY SIDE')) return 'BUY-SIDE';
    if (msg.includes('FUNDRAISING')) return 'FUNDRAISING';
    if (msg.includes('DEBT')) return 'DEBT';
    if (msg.includes('PARTNERSHIP')) return 'PARTNERSHIP';

    switch (notification.type) {
      case 'eoi_received':
        return 'INCOMING OFFER';
      case 'eoi_approved':
        return 'MUTUAL INTEREST';
      case 'eoi_declined':
        return 'DECLINED';
      case 'eoi_approval_blocked':
        return 'ACTION REQUIRED';
      case 'tokens_credited':
      case 'tokens_low':
        return 'TOKENS';
      case 'new_deal':
        return 'NEW DEAL';
      default:
        return 'UPDATE';
    }
  };

  const mandateRef = extractRef();
  const intentLabel = extractIntent();

  // Check if message has privacy lock notice
  const lockNoticePhrase = 'Identity stays hidden until an Expression of Interest is exchanged.';
  const hasLockNotice =
    notification.message.includes(lockNoticePhrase) ||
    notification.type === 'new_counterparty' ||
    notification.type === 'match';

  // Clean body text (strip lock notice if present inside the message string)
  const cleanBodyMessage = notification.message
    .replace(/Identity stays hidden until an Expression of Interest is exchanged\.?/gi, '')
    .trim();

  // Deep-link route calculation with fallback preservation
  const resolvedMatchId = notification.matchId || notification.metadata?.matchId || notification.metadata?.match_id;
  const resolvedProposalId = notification.proposalId || notification.metadata?.proposalId || notification.metadata?.proposal_id;
  const resolvedChatId = notification.metadata?.conversation_id || notification.metadata?.chatId;

  let matchHref = typeRoutes[notification.type] ?? '/deal-dashboard';
  if ((notification.type === 'new_counterparty' || notification.type === 'match') && resolvedMatchId) {
    matchHref = `/deal-log/${resolvedMatchId}`;
  } else if (notification.type === 'new_deal' || notification.type === 'status') {
    matchHref = resolvedProposalId ? '/deal-log' : '/deal-log';
  } else if (resolvedChatId) {
    matchHref = `/chat/${resolvedChatId}`;
  }

  // Get contextual CTA label
  const getActionLabel = () => {
    switch (notification.type) {
      case 'new_counterparty':
      case 'match':
        return 'View Match';
      case 'eoi_received':
        return 'Review Offer';
      case 'eoi_approved':
        return 'View Introduction';
      case 'eoi_declined':
        return 'View Activities';
      case 'eoi_approval_blocked':
      case 'tokens_low':
        return 'Buy Tokens';
      case 'tokens_credited':
        return 'View Balance';
      case 'new_deal':
      case 'status':
        return 'View Mandate';
      default:
        return 'View Details';
    }
  };

  const navigate = () => {
    onMarkAsRead(notification.id);
    router.push(matchHref);
  };

  const isUnread = !notification.isRead;

  return (
    <div
      onClick={navigate}
      className={`relative flex items-start gap-4 p-5 rounded-2xl bg-white border transition-all duration-300 cursor-pointer shadow-sm group hover:-translate-y-0.5 hover:shadow-md ${
        isUnread
          ? 'border-[#FFE4B5] border-l-[4px] border-l-[#FFA000] hover:border-[#FFA000]'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Left Bell Icon Badge */}
      <div
        className={`w-10 h-10 rounded-xl border shrink-0 flex items-center justify-center transition-all duration-300 ${
          isUnread
            ? 'bg-[#fffaf3] border-[#FFE4B5] text-[#FFA000] group-hover:scale-110'
            : 'bg-gray-50 border-gray-200 text-gray-400 group-hover:text-gray-600'
        }`}
      >
        <Bell size={18} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {/* Header Badges & Timestamp */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {mandateRef && (
              <span
                className={`px-2 py-0.5 font-bold text-[11px] rounded tracking-wide border ${
                  isUnread
                    ? 'bg-[#FFF7ED] text-[#EA580C] border-[#FED7AA]'
                    : 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]'
                }`}
              >
                {mandateRef}
              </span>
            )}
            {intentLabel && (
              <span className="px-2 py-0.5 bg-[#F3F4F6] text-[#374151] font-bold text-[11px] rounded uppercase tracking-wider">
                {intentLabel}
              </span>
            )}
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-[#EA580C] shrink-0" />
            )}
          </div>

          <span
            className="text-xs text-gray-400 font-normal shrink-0"
            title={notification.exactTime || undefined}
          >
            {notification.time}
          </span>
        </div>

        {/* Message Body: What happened & Why it is relevant */}
        <p className="text-[13.5px] sm:text-[14px] leading-relaxed text-[#374151] font-normal">
          {cleanBodyMessage}
        </p>

        {/* Privacy Lock Notice */}
        {hasLockNotice && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-normal mt-2.5">
            <Lock size={12} className="shrink-0 text-gray-400" />
            <span>Identity stays hidden until an Expression of Interest is exchanged.</span>
          </div>
        )}

        {/* Action Button: Clear CTA directing to the right destination */}
        <div className="mt-3.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification.id);
              router.push(matchHref);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs active:scale-95 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
          >
            {getActionLabel()}
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}