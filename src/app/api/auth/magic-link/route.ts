import { NextResponse } from 'next/server';
import { verifyMagicLinkToken } from '@/lib/magicLink';
import { signIn } from '@/auth';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const result = verifyMagicLinkToken(token);
  
  if (!result.valid) {
    const errorMessages = {
      malformed: 'Invalid magic link token',
      bad_signature: 'Invalid magic link signature',
      expired: 'Magic link has expired',
    };
    return NextResponse.json({ error: errorMessages[result.reason] }, { status: 400 });
  }

  // NextAuth v5 signIn handles setting the session cookies and throwing a redirect
  await signIn('credentials', { 
    phone: result.payload.phone, 
    redirectTo: '/deal-log?tab=whatsapp' 
  });
}
