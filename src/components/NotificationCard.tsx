'use client';
import { Sparkles, Bell, RefreshCw, Zap, CheckCircle2, XCircle, Coins, AlertCircle, ArrowRight } from 'lucide-react';
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

const typeIcons: Record<NotificationType, React.ReactNode> = {
  match: <Sparkles size={18} className="text-primary-hover" />,
  new_counterparty: <Sparkles size={18} className="text-primary-hover" />,
  eoi_approval_blocked: <AlertCircle size={18} className="text-amber-500" />,
  eoi_received: <Bell size={18} className="text-blue-500" />,
  eoi_approved: <CheckCircle2 size={18} className="text-green-500" />,
  eoi_declined: <XCircle size={18} className="text-red-500" />,
  tokens_credited: <Coins size={18} className="text-primary-hover" />,
  tokens_low: <AlertCircle size={18} className="text-amber-500" />,
  status: <RefreshCw size={18} className="text-blue-500" />,
  new_deal: <Zap size={18} className="text-green-500" />,
  success: <CheckCircle2 size={18} className="text-green-600" />,
  error: <AlertCircle size={18} className="text-red-500" />,
};

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
      className={`relative flex items-start gap-4 p-5 rounded-xl border transition-all cursor-pointer group shadow-sm ${notification.isRead
          ? 'bg-primary-soft/30 border-border hover:bg-primary-soft/50'
          : 'bg-white border-primary/20 border-l-4 border-l-primary hover:shadow-md'
        }`}
    >
      <div className={`p-2.5 rounded-lg shrink-0 ${notification.isRead ? 'bg-white border border-border' : 'bg-primary/10'}`}>
        {typeIcons[notification.type] || <Bell size={18} className="text-brand-secondary" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug mb-1.5 ${notification.isRead ? 'text-brand-secondary' : 'text-foreground font-bold'}`}>
          {notification.message}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-brand-secondary/60 font-bold uppercase tracking-wider">{notification.time}</span>
          {!notification.isRead && (
            <span className="w-1.5 h-1.5 bg-primary rounded-full" />
          )}
        </div>

        {matchHref && (
          <button
            onClick={(e) => {
              e.stopPropagation();        // don't double-fire the card's navigate
              onMarkAsRead(notification.id);
              router.push(matchHref);
            }}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F97316] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#EA580C] transition-all"
          >
            View Match
            <ArrowRight size={12} />
          </button>
        )}

        {notification.type === 'eoi_approval_blocked' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification.id);
              router.push('/profile/billing');
            }}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F97316] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#EA580C] transition-all"
          >
            Buy Tokens
            <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}