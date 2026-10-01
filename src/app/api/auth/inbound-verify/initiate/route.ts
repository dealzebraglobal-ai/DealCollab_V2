import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createInboundVerification } from '@/lib/whatsapp/inboundVerification';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await auth();
    let bodyPhone: string | undefined;

    try {
      const body = await req.json();
      bodyPhone = body?.phone;
    } catch {
      // Body is optional
    }

    const verification = await createInboundVerification({
      userId: session?.user?.id,
      email: session?.user?.email || undefined,
      phone: bodyPhone,
    });

    return NextResponse.json({
      success: true,
      ...verification,
    });
  } catch (error) {
    console.error('[inbound-verify/initiate] Error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate WhatsApp verification' },
      { status: 500 }
    );
  }
}
