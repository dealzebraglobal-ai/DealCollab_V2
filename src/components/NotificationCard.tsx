'use client';
import { Bell, ArrowRight } from 'lucide-react';
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
  time: string;
  isRead: boolean;
  matchId?: string | null;   // present on NEW_COUNTERPARTY alerts; deep-links to /deal-log/[id] (id = proposal_matches.id)
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
  eoi_received: '/deal-dashboard',
  eoi_approved: '/deal-dashboard',
  eoi_declined: '/deal-dashboard',
  tokens_credited: '/profile',
  tokens_low: '/profile',
  status: '/deal-log',
  new_deal: '/deal-dashboard',
  success: '/deal-dashboard',
  error: '/deal-dashboard',
};

export default function NotificationCard({ notification, onMarkAsRead }: NotificationCardProps) {
  const router = useRouter();

  // NEW_COUNTERPARTY alerts carry a matchId and deep-link to the blind match-detail page.
  const matchHref =
    notification.type === 'new_counterparty' && notification.matchId
      ? `/deal-log/${notification.matchId}`
      : null;

  const navigate = () => {
    onMarkAsRead(notification.id);
    router.push(matchHref ?? typeRoutes[notification.type] ?? '/deal-dashboard');
  };

  return (
    <div
      onClick={navigate}
      className={`relative flex items-start gap-4 p-5 rounded-2xl bg-white border transition-all duration-200 cursor-pointer shadow-sm group ${notification.isRead
          ? 'border-[#E5E7EB] hover:border-black'
          : 'animate-border-blink hover:border-black'
        }`}
    >
      <div className={`p-2.5 rounded-xl border shrink-0 transition-all ${notification.isRead
          ? 'bg-[#F3F4F6] border-[#E5E7EB]'
          : 'bg-[#FFF7ED] border-[#FFEDD5]'
        }`}>
        <Bell
          size={18}
          className={notification.isRead ? "text-[#747775]" : "text-[#FF6A00] animate-pulse-fast"}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] leading-relaxed mb-2 font-normal text-[#1F1F1F]">
          {notification.message}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#747775] font-normal">{notification.time}</span>
          {!notification.isRead && (
            <span className="w-1.5 h-1.5 bg-[#FF6A00] rounded-full animate-pulse-fast" />
          )}
        </div>

        {matchHref && (
          <button
            onClick={(e) => {
              e.stopPropagation();        // don't double-fire the card's navigate
              onMarkAsRead(notification.id);
              router.push(matchHref);
            }}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#EA580C] border border-[#E5E7EB] hover:border-[#FF6A00]/40 hover:bg-[#FFF7ED] text-xs font-medium transition-all shadow-sm active:scale-95"
          >
            View Match
            <ArrowRight size={13} />
          </button>
        )}

        {notification.type === 'eoi_approval_blocked' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification.id);
              router.push('/profile/billing');
            }}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#EA580C] border border-[#E5E7EB] hover:border-[#FF6A00]/40 hover:bg-[#FFF7ED] text-xs font-medium transition-all shadow-sm active:scale-95"
          >
            Buy Tokens
            <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}