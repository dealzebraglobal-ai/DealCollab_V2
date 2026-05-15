'use client';
import React, { useState, useEffect, useCallback } from 'react';
import NotificationList from '@/components/NotificationList';
import { useNotifications } from '@/components/NotificationProvider';
import { NotificationSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import { Bell } from 'lucide-react';

import FeatureLockedOverlay from '@/components/FeatureLockedOverlay';

export default function NotificationsPage() {
  const isLocked = false; // Feature lock enabled
  const { notifications, markAsRead, markAllAsRead, unreadCount, addNotification, refreshNotifications } = useNotifications();
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchUpdatedNotifications = useCallback(async (isBackground = false) => {
    if (!isBackground) setInitialLoading(true);
    else setRefreshing(true);
    
    try {
      await refreshNotifications();
      if (isBackground) {
        addNotification({
          type: 'success',
          message: 'Notifications updated in real-time.',
          time: 'Just now'
        });
      }
    } catch {
      if (!isBackground) setError(true);
    } finally {
      if (!isBackground) setInitialLoading(false);
      setRefreshing(false);
    }
  }, [refreshNotifications, addNotification]);

  useEffect(() => {
    // Defer initial fetch to avoid synchronous setState warning in effect body
    const initTimer = setTimeout(() => {
      fetchUpdatedNotifications();
    }, 0);
    
    // Auto-refresh notifications every 60 seconds
    const interval = setInterval(() => {
      fetchUpdatedNotifications(true);
    }, 60000);
    
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [fetchUpdatedNotifications]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    setTimeout(() => setLoadingMore(false), 2000);
  };

  const retryFetch = () => {
    fetchUpdatedNotifications();
  };

  return (
    <div className={`relative flex-1 flex flex-col w-full bg-white ${isLocked ? 'h-screen overflow-hidden' : 'h-full'}`}>
      {isLocked && <FeatureLockedOverlay />}
      <div className={`flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 ${isLocked ? 'pointer-events-none blur-md overflow-hidden' : 'overflow-y-auto'}`}>
      
      {/* Top Bar Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-1">
             <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Notifications</h1>
             <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-100 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Live</span>
             </div>
             {refreshing && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full animate-in fade-in slide-in-from-left-2 transition-all">
                   <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Syncing...</span>
                </div>
             )}
          </div>
          <p className="text-[#6B7280] text-sm font-medium">Showing 90-day activity history</p>
        </div>

        {unreadCount > 0 && (
          <button 
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#F97316] hover:bg-[#F97316]/5 rounded-xl transition-all border border-[#F97316]/20"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl w-full">
        {initialLoading ? (
          <NotificationSkeleton />
        ) : error ? (
          <ErrorState onRetry={retryFetch} />
        ) : notifications.length === 0 ? (
          <EmptyState 
            title="All caught up!"
            description="You don't have any notifications at the moment. We'll alert you when there's news on your matches or token updates."
            icon={<Bell size={32} />}
          />
        ) : (
          <>
            <NotificationList 
              notifications={notifications} 
              onMarkAsRead={markAsRead}
            />

            {/* Infinite Scroll Indicator */}
            <div className="mt-8 py-8 border-t border-gray-100 flex flex-col items-center">
               {loadingMore ? (
                 <div className="flex items-center gap-2 text-xs font-bold text-[#6B7280]">
                    <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
                    Retrieving older history...
                 </div>
               ) : (
                 <button 
                   onClick={handleLoadMore}
                   className="text-xs font-black uppercase tracking-widest text-[#9CA3AF] hover:text-[#F97316] transition-colors"
                 >
                    Load more activity
                 </button>
               )}
            </div>
          </>
        )}
      </div>

      {/* Bottom spacing for scrollability */}
      <div className="h-20 shrink-0" />
    </div>
    </div>
  );
}
