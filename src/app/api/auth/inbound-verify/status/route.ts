import { NextRequest, NextResponse } from 'next/server';
import { checkInboundVerificationStatus } from '@/lib/whatsapp/inboundVerification';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const status = await checkInboundVerificationStatus(code);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[inbound-verify/status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check verification status' },
      { status: 500 }
    );
  }
}
