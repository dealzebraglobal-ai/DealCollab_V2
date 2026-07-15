'use client';
import React from 'react';
import NotificationCard, { Notification } from './NotificationCard';

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: number | string) => void;
}

export default function NotificationList({ notifications, onMarkAsRead }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-[#F9FAFB] border-2 border-dashed border-[#E5E7EB] rounded-2xl">
        <p className="text-[#6B7280] font-bold text-lg">No new notifications</p>
        <p className="text-sm text-[#9CA3AF] mt-1">We'll let you know when something happens.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
        />
      ))}
    </div>
  );
}