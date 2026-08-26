import type { MetadataRoute } from 'next';
import { GUIDE_DOCS } from '@/lib/guideData';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.dealcollab.org';

/**
 * Served at /sitemap.xml via Next.js's native metadata route convention.
 * Deliberately lists ONLY genuinely public marketing/informational pages —
 * no dashboard, deal, proposal, profile, or admin URLs (same exclusion list
 * as robots.ts). Guide slugs are pulled from the existing GUIDE_DOCS
 * manifest (src/lib/guideData.ts) instead of hardcoded, so a new guide page
 * is picked up automatically without touching this file again.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/welcome`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/guide`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/data-deletion`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
  ];

  const guideEntries: MetadataRoute.Sitemap = GUIDE_DOCS.map((doc) => ({
    url: `${SITE_URL}/guide/${doc.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticEntries, ...guideEntries];
}
