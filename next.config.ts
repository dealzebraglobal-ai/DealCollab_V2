import type { NextConfig } from "next";

/**
 * Security headers (OWASP baseline). Previously next.config.ts had no
 * `headers()` at all — no clickjacking defense, no CSP, no HSTS. These are
 * additive (don't change routing/behavior) so they can't break existing
 * features, but DO constrain what the browser will load/execute — CSP here
 * intentionally allows: 'self' + Supabase (browser talks to it directly for
 * storage uploads/public URLs, see ProfileStepper.tsx) + Google (OAuth +
 * avatar images) + 'unsafe-inline'/'unsafe-eval' for styles/scripts because
 * Next.js's own runtime and inline styles need them (tightening further
 * would require a nonce-based setup, a bigger change than a hardening pass).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://accounts.google.com",
  "frame-src 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      { 
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '**',
      },
    ],
  },
  // Allow local development tunnels (ngrok, cloudflare, localtunnel) to load Next.js client resources
  allowedDevOrigins: [
    'localhost:3000',
    'localhost:3001',
    '*.trycloudflare.com',
    '*.ngrok-free.app',
    '*.loca.lt',
  ],
  // Optimizations for Vercel / Production build.
  // console.log/warn are stripped in production (many existing call sites log
  // phone numbers/emails, e.g. otp/verify, whatsapp webhook) — console.error
  // is kept so real failures still surface in Vercel logs.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  // Setting the tracing root can help avoid scanning outside the project
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['pdf-parse'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
