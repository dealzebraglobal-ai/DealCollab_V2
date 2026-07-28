'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Notification } from '@/components/NotificationCard';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: number | string) => void;
  markAllAsRead: () => void;
  addNotification: (notif: Omit<Notification, 'id' | 'isRead'>) => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

import { createSupabaseClient } from '@/utils/supabase/client';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function formatRelativeTime(dateString: string): string {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const { data: apiNotifications, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 15000
  });

  const [localNotifs, setLocalNotifs] = useState<Notification[]>([]);

  useEffect(() => {
    if (apiNotifications && Array.isArray(apiNotifications)) {
      const mapped = apiNotifications.map((n: Record<string, unknown>) => ({
        id: n.id as string | number,
        type: String(n.type).toLowerCase() as Notification['type'],
        message: String(n.message),
        time: n.created_at ? formatRelativeTime(String(n.created_at)) : 'Just now',
        // is_read is a BOOLEAN column. The old `=== 'true'` string compare was always false,
        // so everything showed unread. Accept boolean true (and legacy string just in case).
        isRead: n.is_read === true || n.is_read === 'true',
        // carry match_id through so NEW_COUNTERPARTY cards can deep-link to /matches/[matchId]
        matchId: (n.match_id as string | null) ?? null,
      }));
      // Delay state update to avoid synchronous cascading render warnings in React 19
      Promise.resolve().then(() => setLocalNotifs(mapped));
    }
  }, [apiNotifications]);

  useEffect(() => {
    // Without a filter, this subscribed to INSERTs on the ENTIRE notifications
    // table with the anon key — the `notifications` table has no RLS, so every
    // connected browser received every user's notification row payload over
    // the websocket (the code only used it as a refetch trigger, but the full
    // row still transited the client). Scoping the filter to this user's own
    // rows is the practical fix available without adopting Supabase Auth (see
    // security report — RLS with auth.uid() can't bind to a NextAuth session).
    if (!userId) return;

    const supabase = createSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel(`realtime-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          mutate(); // Re-fetch immediately when DB changes
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mutate, userId]);

  const notifications = localNotifs;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = async (id: number | string) => {
    setLocalNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    mutate();
  };

  const markAllAsRead = () => {
    setLocalNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    // Real implementation would have a mark-all route
  };

  const addNotification = (notif: Omit<Notification, 'id' | 'isRead'>) => {
    const newNotif = {
      ...notif,
      id: Date.now(),
      isRead: false
    };
    setLocalNotifs(prev => [newNotif, ...prev]);
  };

  const refreshNotifications = async () => {
    await mutate();
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, addNotification, refreshNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
