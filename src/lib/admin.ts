import { auth } from '@/auth';

export type AdminAccess = {
    allowed: boolean;
    email: string | null;
    configured: boolean;
};

export function getAdminEmails(): string[] {
    return (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

export async function getAdminAccess(): Promise<AdminAccess> {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase() || null;
    const adminEmails = getAdminEmails();

    return {
        allowed: !!email && adminEmails.includes(email),
        email,
        configured: adminEmails.length > 0,
    };
}



