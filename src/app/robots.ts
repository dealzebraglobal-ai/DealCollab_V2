import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.dealcollab.org';

/**
 * Served at /robots.txt via Next.js's native metadata route convention
 * (no route handler needed). Previously there was no robots.ts/route at all,
 * so /robots.txt 404'd in production.
 *
 * Disallows API routes and every authenticated/private surface — dashboard
 * pages, deal/proposal detail pages, profile, notifications, admin, and the
 * internal cartography tool — none of which should ever be crawled or
 * indexed. This is defense-in-depth alongside the `noindex` response header
 * added in next.config.ts for those same paths (robots.txt alone is not a
 * security mechanism — a misbehaving crawler can ignore it).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/admin/',
        '/cartography',
        '/home',
        '/profile',
        '/profile/',
        '/deal/',
        '/deal-log',
        '/deal-log/',
        '/deal-dashboard',
        '/deal-dashboard/',
        '/deal-intelligence',
        '/eoi-review/',
        '/notifications',
        '/analytics',
        '/signup',
        '/verify',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
