'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import NotificationList from '@/components/NotificationList';
import { useNotifications } from '@/components/NotificationProvider';
import { useUser } from '@/components/UserProvider';
import { NotificationSkeleton, EmptyState, ErrorState } from '@/components/Skeleton';
import { Bell, Lock } from 'lucide-react';
import FeatureLockedOverlay from '@/components/FeatureLockedOverlay';

export default function NotificationsPage() {
  const isLocked = false;
  const { notifications, markAsRead, markAllAsRead, unreadCount, refreshNotifications } = useNotifications();
  const { tokens } = useUser();
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchUpdatedNotifications = useCallback(async (isBackground = false) => {
    if (!isBackground) setInitialLoading(true);
    else setRefreshing(true);
    
    try {
      await refreshNotifications();
    } catch {
      if (!isBackground) setError(true);
    } finally {
      if (!isBackground) setInitialLoading(false);
      setRefreshing(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      fetchUpdatedNotifications();
    }, 0);
    
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
        
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1F2937] tracking-tight">Notifications</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#E8F8F0] border border-[#DCFCE7] rounded-full">
              <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full" />
              <span className="text-[11px] font-bold text-[#16A34A] uppercase tracking-wider">LIVE</span>
            </div>
            {refreshing && (
              <div className="flex items-center gap-2 px-2.5 py-0.5 bg-gray-50 rounded-full animate-in fade-in transition-all">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-[#FF6A00] rounded-full animate-spin" />
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Syncing...</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link 
              href="/profile/tokens"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F9FAFB] border border-[#E5E7EB] text-gray-800 rounded-full text-xs font-semibold hover:bg-gray-100 transition-all shadow-2xs"
            >
              <Lock size={12} className="text-gray-500" />
              <span>{typeof tokens === 'number' ? tokens : 700} Tokens</span>
            </Link>

            <button 
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all border shadow-2xs active:scale-95 ${
                unreadCount > 0
                  ? 'text-[#EA580C] bg-white border-[#FED7AA] hover:bg-[#FFF7ED]'
                  : 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed'
              }`}
            >
              Mark all as read
            </button>
          </div>
        </div>

        {/* Subheader History Info & Sorting */}
        <div className="flex items-center justify-between text-xs py-4 mb-2">
          <p className="text-gray-500 font-normal">Showing 90-day activity history</p>
          <span className="text-gray-400 font-medium">Sorted by most recent</span>
        </div>

        {/* Main Content Area */}
        <div className="w-full">
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
                  <div className="flex items-center gap-2 text-xs font-medium text-[#6B7280]">
                    <div className="w-4 h-4 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
                    Retrieving older history...
                  </div>
                ) : (
                  <button 
                    onClick={handleLoadMore}
                    className="text-xs font-medium text-[#9CA3AF] hover:text-[#FF6A00] transition-colors"
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
