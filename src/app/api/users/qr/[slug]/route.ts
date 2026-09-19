import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public resolver for Profile / Disclosure QR code scans.
 * Does not expose internal UUIDs or raw PII directly in the QR string.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Safe redirect to main app destination
  if (slug.startsWith('disc_')) {
    // Disclosure link -> route to deal log
    return NextResponse.redirect(new URL(`/deal-log`, req.url));
  }

  // Public profile link -> redirect to profile view
  return NextResponse.redirect(new URL(`/deal-dashboard`, req.url));
}
