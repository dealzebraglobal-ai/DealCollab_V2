/**
 * Builds the URL encoded into a vCard QR code. Never pass a raw user id,
 * email, or phone here — only the opaque `profileSlug` (see
 * /api/identity-card). Routes through the existing public QR resolver
 * (/api/users/qr/[slug]), which redirects usr_* slugs to the real public
 * profile page at /p/[slug] server-side — the slug itself never leaks which
 * page it resolves to until the server decides.
 */
export function buildPublicProfileUrl(profileSlug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.dealcollab.org';
  return `${base.replace(/\/$/, '')}/api/users/qr/${profileSlug}`;
}
