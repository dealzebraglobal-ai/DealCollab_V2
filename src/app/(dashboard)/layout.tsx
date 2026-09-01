'use client';
import React, { useEffect, useSyncExternalStore } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/components/UserProvider';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import GlobalErrorBanner from '@/components/GlobalErrorBanner';
import { ChatProvider } from '@/components/ChatProvider';
import OnboardingTutorial from '@/components/OnboardingTutorial';

const subscribe = () => () => {};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated } = useUser();
  const { status } = useSession();

  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    if (isMounted && status === 'unauthenticated') {
      router.replace('/');
    }
  }, [isMounted, status, router]);

  // Prevent hydration mismatch by rendering null on the server and first client pass
  if (!isMounted || status === 'loading') {
    return null;
  }

  // Final rendering protection
  if (status === 'unauthenticated' && !isAuthenticated && typeof window !== 'undefined' && localStorage.getItem('isLoggedIn') !== 'true') {
     return null;
  }

  return (
    <ChatProvider>
      <DashboardLayout>
        <GlobalErrorBanner />
        <OnboardingTutorial />
        {children}
      </DashboardLayout>
    </ChatProvider>
  );
}
