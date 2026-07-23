import { auth } from '@/auth';

export type AdminAccess = {
    allowed: boolean;
    email: string | null;
    configured: boolean;
};

/**
 * Single source of truth for the ADMIN_EMAILS allowlist.
 * Must be a server-only env var (never NEXT_PUBLIC_) — never read this from a Client Component.
 */
export function getAdminEmails(): string[] {
    const raw = process.env.ADMIN_EMAILS;

    if (!raw) {
        // Logged on every server-side read so a missing Vercel env var is loud in the deploy logs
        // instead of silently rejecting every admin login.
        console.error('ADMIN_EMAILS is not configured. Set it in Vercel → Project → Settings → Environment Variables.');
        return [];
    }

    return raw
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Single source of truth for "is this email an admin". Use this everywhere —
 * do not re-implement the allowlist comparison in individual routes/components.
 */
export function isAdmin(email: string | undefined | null): boolean {
    if (!email) return false;
    const allowed = getAdminEmails();
    return allowed.includes(email.trim().toLowerCase());
}

export async function getAdminAccess(): Promise<AdminAccess> {
    const session = await auth();
    const rawEmail = session?.user?.email ?? null;
    const email = rawEmail?.trim().toLowerCase() || null;
    const adminEmails = getAdminEmails();
    const allowed = isAdmin(email);

    if (process.env.NODE_ENV === 'development') {
        console.log('[admin] Logged in email:', rawEmail);
        console.log('[admin] Allowed emails:', adminEmails);
        console.log('[admin] Environment loaded:', adminEmails.length > 0);
        console.log('[admin] Is Admin:', allowed);
        console.log('[admin] Environment:', process.env.VERCEL_ENV || process.env.NODE_ENV);
    }

    return {
        allowed,
        email,
        configured: adminEmails.length > 0,
    };
}



