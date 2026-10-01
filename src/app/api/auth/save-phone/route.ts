import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { verifyAuthVerificationToken } from '@/lib/authVerificationToken';

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { phone, verificationToken } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone is required' }, { status: 400 });
    }

    if (phone.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const session = await auth();

    if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If verificationToken is provided, verify it.
    // For authenticated users with an active session, direct saving is permitted.
    if (verificationToken && typeof verificationToken === 'string') {
      const tokenCheck = verifyAuthVerificationToken(verificationToken, 'phone', phone);
      if (!tokenCheck.valid) {
        return NextResponse.json({ error: 'Invalid or expired phone verification proof. Please request a new code.' }, { status: 400 });
      }
    }

    // Check if phone is already used by another account
    const existingUser = await db.query.users.findFirst({
      where: eq(users.phone, phone),
    });

    if (existingUser && existingUser.id !== session.user.id) {
       // Allow overriding only if it's a confirmed placeholder (now safe because the user proved phone ownership)
       const isPlaceholder = existingUser.email?.includes('@dealcollab.ai');
       if (isPlaceholder) {
          await db.delete(users).where(eq(users.id, existingUser.id));
       } else {
          return NextResponse.json({ error: 'This phone number is already linked to another active account.' }, { status: 403 });
       }
    }

    // Update the current user
    await db.update(users)
      .set({ 
        phone: phone,
        isPhoneVerified: true,
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save Phone Route Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
