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

  // Disclosure link -> route to deal log (requires auth; only the approved
  // counterparty who holds this reference can see anything there).
  if (slug.startsWith('disc_')) {
    return NextResponse.redirect(new URL(`/deal-log`, req.url));
  }

  // Public profile link (usr_xxxxxxxx) -> the actual public, unauthenticated
  // profile page for that member. Previously this fell through to a generic
  // /deal-dashboard redirect that ignored the slug entirely and bounced an
  // unauthenticated scanner to /login instead of showing the shared profile.
  if (slug.startsWith('usr_')) {
    return NextResponse.redirect(new URL(`/p/${slug}`, req.url));
  }

  return NextResponse.redirect(new URL('/login', req.url));
}
