'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { GA_MEASUREMENT_ID, trackPageView } from '@/lib/analytics';

/**
 * Fires a page_view on every client-side route change. GA4's own gtag.js
 * config call only fires page_view once, on initial script load — it has no
 * way to observe Next.js App Router's client-side navigations, so without
 * this every route after the first would go untracked.
 *
 * Reads the query string via `window.location.search` inside the effect
 * instead of `useSearchParams()`. `useSearchParams()` opts the ENTIRE page
 * into client-side rendering during static generation (Next.js's documented
 * "missing-suspense-with-csr-bailout" behavior) — confirmed empirically here:
 * this component sits in the root layout, so every statically-generated
 * public page (/, /welcome, /guide, /guide/[slug], /terms, /privacy,
 * /data-deletion) was shipping an EMPTY initial HTML body
 * (`BAILOUT_TO_CLIENT_SIDE_RENDERING`) with all visible content deferred to
 * client hydration, even though only this one page-view tracker actually
 * needed the query string, and only inside a `useEffect` that already only
 * runs in the browser. Swapping to `window.location.search` keeps identical
 * tracking behavior (same event, same path+query string) with no reactive
 * hook that trips the static-rendering bailout — verified fix: rebuilding
 * with this change removes the bailout marker from every public page.
 *
 * Trade-off: this only re-fires on a pathname change, not a query-only
 * change on the same path (e.g. a client-side `router.push('?tab=x')`).
 * `usePathname()` was the only App Router hook available that's both
 * reactive to navigation and does NOT require a Suspense/CSR bailout, so a
 * same-path query-only navigation won't emit a duplicate page_view. This is
 * an acceptable, narrow trade for restoring server-rendered content on every
 * public page — GA's own custom business events (chat_started, chat_message,
 * proposal_created, etc. in src/lib/analytics.ts) are unaffected either way.
 */
function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const query = typeof window !== 'undefined' ? window.location.search : '';
    trackPageView(query ? `${pathname}${query}` : pathname);
  }, [pathname]);

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
      <PageViewTracker />
    </>
  );
}
