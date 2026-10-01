'use client';
import React, { useEffect, useSyncExternalStore } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useUser } from '@/components/UserProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import GlobalErrorBanner from '@/components/GlobalErrorBanner';
import { ChatProvider } from '@/components/ChatProvider';
import OnboardingTutorial from '@/components/OnboardingTutorial';

const subscribe = () => () => {};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isProfileLoading, isProfileComplete } = useUser();
  const { status } = useSession();

  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    if (isMounted && status === 'unauthenticated') {
      // / is the public marketing homepage now (moved 2026-09-07) — an
      // unauthenticated visit to a protected route goes to /login, not /.
      router.replace('/login');
    }
  }, [isMounted, status, router]);

  // Profile completion enforcement: users without a completed profile cannot access dashboard features
  useEffect(() => {
    if (isMounted && status === 'authenticated' && !isProfileLoading && !isProfileComplete) {
      if (pathname && !pathname.startsWith('/profile')) {
        console.log('[AppLayout] Incomplete profile detected — redirecting to /profile');
        router.replace('/profile');
      }
    }
  }, [isMounted, status, isProfileLoading, isProfileComplete, pathname, router]);

  // Prevent hydration mismatch by rendering null on the server and first client pass
  if (!isMounted || status === 'loading') {
    return null;
  }

  // Final rendering protection: unauthenticated users must never render protected dashboard layout
  if (status !== 'authenticated' || !isAuthenticated) {
     return null;
  }

  // If profile is incomplete and user is not on /profile, block rendering dashboard content
  if (!isProfileLoading && !isProfileComplete && pathname && !pathname.startsWith('/profile')) {
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
