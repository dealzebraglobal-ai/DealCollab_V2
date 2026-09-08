import type { Metadata } from 'next';
import GuideAuthWrapper from './GuideAuthWrapper';

export const metadata: Metadata = {
  title: { default: 'Guide & Trust — DealCollab', template: '%s — DealCollab' },
  description:
    'How DealCollab works, how matching happens, how tokens work, privacy, security, platform rules, and frequently asked questions.',
  alternates: { canonical: '/guide' },
};

/**
 * Guide & Trust lives OUTSIDE the (dashboard) route group (moved 2026-09-07 —
 * see git history for the prior nested location). It must stay readable
 * while signed out, since it's the trust content prospects read before
 * signing up, and it's also the site's primary indexable content library.
 *
 * Root cause this move fixes: src/app/(dashboard)/layout.tsx's AppLayout
 * returns `null` on the server (and on the client until auth status
 * resolves) — correct for the actual dashboard, but Guide was physically
 * nested under that route group despite this comment's prior claim of being
 * "deliberately outside" it. That meant every /guide and /guide/[slug]
 * request — including Googlebot's — got an empty page until client-side
 * hydration ran and auth resolved. Verified in the production build: before
 * this move, the server-rendered HTML body for /guide and every article was
 * empty; after, it contains the real heading/article content.
 *
 * Trade-off, accepted deliberately rather than reproduced: a signed-in user
 * visiting /guide previously saw the full authenticated app chrome (Sidebar
 * + DashboardLayout + ChatProvider), because that chrome came from the
 * (dashboard) layout this route no longer sits under. Re-adding it here
 * would mean mounting ChatProvider/DashboardLayout — both of which assume an
 * authenticated session — on a route that must also serve anonymous
 * crawlers safely, which is meaningfully more risk than this fix's actual
 * goal. Guide pages instead keep their own lightweight header
 * (GuideHeader — breadcrumbs + back button) for every visitor, signed in or
 * not. If the full app chrome is wanted back for signed-in users, that's a
 * separate, deliberate follow-up (e.g. a client-side conditional wrapper
 * keyed on session status), not part of this fix.
 */
export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <GuideAuthWrapper>
      {children}
    </GuideAuthWrapper>
  );
}
