'use client';

import Script from 'next/script';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_MEASUREMENT_ID, trackPageView } from '@/lib/analytics';

/**
 * Fires a page_view on every client-side route change. GA4's own gtag.js
 * config call only fires page_view once, on initial script load — it has no
 * way to observe Next.js App Router's client-side navigations, so without
 * this every route after the first would go untracked.
 */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const query = searchParams.toString();
    trackPageView(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Loads gtag.js and wires up automatic page-view tracking. Gated on
 * NEXT_PUBLIC_GA_MEASUREMENT_ID — renders nothing (no script tags at all) if
 * the env var is unset, so local dev and any deploy without GA configured
 * never load third-party analytics.
 *
 * strategy="afterInteractive" defers loading until after the page is
 * interactive, matching Next.js's documented recommendation for analytics
 * scripts — this avoids blocking initial render/hydration for a
 * non-critical script.
 */
export default function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
      {/* useSearchParams requires a Suspense boundary in the App Router */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
}
