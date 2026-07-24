import type { Metadata } from 'next';
import { ChatProvider } from '@/components/ChatProvider';
import DashboardLayout from '@/components/DashboardLayout';

export const metadata: Metadata = {
  title: { default: 'Guide & Trust — DealCollab', template: '%s — DealCollab' },
  description:
    'How DealCollab works, how matching happens, how tokens work, privacy, security, platform rules, and frequently asked questions.',
};

/**
 * Guide & Trust is deliberately OUTSIDE the (dashboard) route group: it must
 * stay readable while signed out (it's the trust page prospects read before
 * signing up), so it can't sit behind the (dashboard) layout's auth redirect.
 * It still renders the exact same app chrome (Sidebar + DashboardLayout) so
 * a signed-in user never feels like they left the product.
 */
export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </ChatProvider>
  );
}
