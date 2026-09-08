'use client';
import React, { useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/DashboardLayout';
import { ChatProvider } from '@/components/ChatProvider';

const subscribe = () => () => {};

export default function GuideAuthWrapper({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  // If client-side and user is authenticated, render with DashboardLayout and Sidebar
  if (isMounted && status === 'authenticated') {
    return (
      <ChatProvider>
        <DashboardLayout>
          {children}
        </DashboardLayout>
      </ChatProvider>
    );
  }

  // Fallback for SSR and unauthenticated users: just render children
  // (Provides SEO safety since crawler won't trigger authenticated branch)
  return <>{children}</>;
}
