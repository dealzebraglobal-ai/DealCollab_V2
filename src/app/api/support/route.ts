// src/app/api/support/route.ts
/**
 * In-app "Support Ticket" form (HelpSupportModal) — sends a real email via the
 * SAME transactional email provider already used for notification delivery
 * (src/lib/email/brevo.ts, Brevo). No new provider/dependency introduced.
 *
 * Destination: SUPPORT_INBOX_EMAIL if set, else BREVO_REPLY_TO_EMAIL, else
 * BREVO_SENDER_EMAIL (all already-configured env vars) — so this works out of
 * the box on any environment that already sends notification emails.
 */

import { auth } from '@/auth';
import { resolveDbUser } from '@/lib/resolveDbUser';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { sendBrevoEmail } from '@/lib/email/brevo';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SUBJECT_LEN = 150;
const MAX_MESSAGE_LEN = 4000;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const authUser = session?.user as { id?: string; email?: string; phone?: string; name?: string } | undefined;
    if (!authUser?.id && !authUser?.email && !authUser?.phone) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`support-ticket:user:${authUser.id || authUser.email || authUser.phone}`, 5, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many support requests — please wait before trying again.' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, MAX_SUBJECT_LEN) : '';
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LEN) : '';

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const dbUser = await resolveDbUser<{ id: string; name: string | null; email: string | null; phone: string | null }>(
      supabase,
      authUser,
      'id, name, email, phone',
    );

    const supportInbox = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_REPLY_TO_EMAIL || process.env.BREVO_SENDER_EMAIL;
    if (!supportInbox) {
      console.error('[POST /api/support] No support inbox configured (SUPPORT_INBOX_EMAIL / BREVO_REPLY_TO_EMAIL / BREVO_SENDER_EMAIL all unset)');
      return NextResponse.json({ error: 'Support email is not configured yet. Please use WhatsApp support instead.' }, { status: 503 });
    }

    const requesterEmail = dbUser?.email || authUser.email || null;
    const requesterName = dbUser?.name || authUser.name || 'DealCollab user';
    const requesterPhone = dbUser?.phone || authUser.phone || null;

    const subjectLine = `[Support] ${subject || 'New support ticket'} — ${requesterName}`;
    const text =
      `New support ticket from ${requesterName}\n` +
      `Email: ${requesterEmail || 'Not provided'}\n` +
      `Phone: ${requesterPhone || 'Not provided'}\n` +
      `User ID: ${dbUser?.id || 'Unknown'}\n\n` +
      `Subject: ${subject || '(none)'}\n\n` +
      `${message}`;
    const html =
      `<p><strong>New support ticket</strong></p>` +
      `<p>From: ${escapeHtml(requesterName)}<br/>` +
      `Email: ${escapeHtml(requesterEmail || 'Not provided')}<br/>` +
      `Phone: ${escapeHtml(requesterPhone || 'Not provided')}<br/>` +
      `User ID: ${escapeHtml(dbUser?.id || 'Unknown')}</p>` +
      `<p><strong>Subject:</strong> ${escapeHtml(subject || '(none)')}</p>` +
      `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`;

    await sendBrevoEmail({
      toEmail: supportInbox,
      toName: 'DealCollab Support',
      subject: subjectLine,
      html,
      text,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('🔥 POST /api/support ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send support ticket' },
      { status: 500 },
    );
  }
}
