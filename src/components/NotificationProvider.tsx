'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Notification } from '@/components/NotificationCard';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: number | string) => void;
  markAllAsRead: () => void;
  addNotification: (notif: Omit<Notification, 'id' | 'isRead'>) => void;
  refreshNotifications: () => Promise<void>;
  isSoundMuted: boolean;
  toggleSound: () => void;
}

const SOUND_MUTE_KEY = 'dealcollab_notification_sound_muted';

// Short synthesized chime via Web Audio API — no audio asset/dependency needed, and it
// naturally respects browser autoplay restrictions (a suspended/blocked AudioContext just
// throws, which is caught and ignored below).
function playNotificationChime() {
  try {
    const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return;
    const ctx = new AudioCtxCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1108, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // Autoplay policy blocked it, or Web Audio isn't available — fail silently.
  }
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

import { createSupabaseClient } from '@/utils/supabase/client';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
// Single centralized timestamp utility (src/utils/date.ts) — every relative/exact
// timestamp in the app (Deal Log, notifications, EOI, P1/P2) now goes through this
// same module instead of each component re-deriving its own "Xm ago" logic.
import { formatRelativeTime, formatExactDateTime } from '@/utils/date';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const { data: apiNotifications, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 15000
  });

  const [localNotifs, setLocalNotifs] = useState<Notification[]>([]);

  const [isSoundMuted, setIsSoundMuted] = useState(false);
  useEffect(() => {
    try {
      setIsSoundMuted(localStorage.getItem(SOUND_MUTE_KEY) === 'true');
    } catch {
      // localStorage unavailable (e.g. private browsing) — default to unmuted.
    }
  }, []);

  const toggleSound = useCallback(() => {
    setIsSoundMuted(prev => {
      const next = !prev;
      try { localStorage.setItem(SOUND_MUTE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Baseline of notification ids already seen this session. `null` means "not yet
  // established" — the first successful fetch seeds it WITHOUT playing a sound, so
  // notifications loaded from history never trigger the chime. Only ids that appear
  // in a LATER fetch and weren't in the baseline count as genuinely new.
  const seenIdsRef = useRef<Set<string | number> | null>(null);
  const isSoundMutedRef = useRef(isSoundMuted);
  useEffect(() => {
    isSoundMutedRef.current = isSoundMuted;
  }, [isSoundMuted]);

  useEffect(() => {
    if (apiNotifications && Array.isArray(apiNotifications)) {
      const mapped = apiNotifications.map((n: Record<string, unknown>) => ({
        id: n.id as string | number,
        type: String(n.type).toLowerCase() as Notification['type'],
        message: String(n.message),
        time: formatRelativeTime(n.created_at as string | undefined),
        exactTime: n.created_at ? formatExactDateTime(String(n.created_at)) : null,
        // is_read is a BOOLEAN column. The old `=== 'true'` string compare was always false,
        // so everything showed unread. Accept boolean true (and legacy string just in case).
        isRead: n.is_read === true || n.is_read === 'true',
        // carry match_id through so NEW_COUNTERPARTY cards can deep-link to /matches/[matchId]
        matchId: (n.match_id as string | null) ?? null,
        proposalId: (n.proposal_id as string | null) ?? null,
        metadata: (n.metadata as Record<string, unknown> | null) ?? null,
      }));

      if (seenIdsRef.current === null) {
        seenIdsRef.current = new Set(mapped.map(n => n.id));
      } else {
        const hasNewNotif = mapped.some(n =>
          !seenIdsRef.current!.has(n.id) && !n.isRead
        );
        for (const n of mapped) seenIdsRef.current.add(n.id);
        if (hasNewNotif && !isSoundMutedRef.current) playNotificationChime();
      }

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

  const markAsRead = useCallback(async (id: number | string) => {
    // Optimistic update for instant feedback...
    setLocalNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) {
        console.error('[NotificationProvider] markAsRead failed — reverting optimistic update', await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error('[NotificationProvider] markAsRead network error', err);
    } finally {
      // ...then always reconcile against the database (the real source of truth) —
      // if the PATCH silently failed, this is what surfaces the still-unread state
      // instead of leaving the UI stuck showing a "read" notification that never
      // actually persisted.
      mutate();
    }
  }, [mutate]);

  const markAllAsRead = useCallback(async () => {
    setLocalNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true })
      });
      if (!res.ok) {
        console.error('[NotificationProvider] markAllAsRead failed — reverting optimistic update', await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error('[NotificationProvider] markAllAsRead network error', err);
    } finally {
      mutate();
    }
  }, [mutate]);

  const addNotification = useCallback((notif: Omit<Notification, 'id' | 'isRead'>) => {
    const newNotif = {
      ...notif,
      id: Date.now(),
      isRead: false
    };
    setLocalNotifs(prev => [newNotif, ...prev]);
  }, []);

  const refreshNotifications = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const contextValue = useMemo(() => ({
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    addNotification,
    refreshNotifications,
    isSoundMuted,
    toggleSound,
  }), [notifications, unreadCount, markAsRead, markAllAsRead, addNotification, refreshNotifications, isSoundMuted, toggleSound]);

  return (
    <NotificationContext.Provider value={contextValue}>
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
