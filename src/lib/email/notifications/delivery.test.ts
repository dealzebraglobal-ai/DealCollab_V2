import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliverNotificationEmail, type NotificationRow } from './delivery';
import * as brevoModule from '@/lib/email/brevo';

vi.mock('@/lib/email/brevo', () => ({
  sendBrevoEmail: vi.fn(),
}));

describe('deliverNotificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSupabase = (user: { id: string; name: string; email: string } | null) => {
    return {
      from: vi.fn((table: string) => {
        if (table === 'notification_deliveries') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'delivery-123' }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: user,
                  error: user ? null : { message: 'User not found' },
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;
  };

  it('delivers EOI_RECEIVED email to the designated user email', async () => {
    const mockSend = vi.spyOn(brevoModule, 'sendBrevoEmail').mockResolvedValue({
      providerMessageId: 'msg-abc-123',
    });

    const supabase = mockSupabase({
      id: 'user-1',
      name: 'Rohan Sharma',
      email: 'rohan@example.com',
    });

    const notification: NotificationRow = {
      id: 'notif-1',
      user_id: 'user-1',
      type: 'EOI_RECEIVED',
      message: 'A verified investor submitted an Expression of Interest.',
      is_read: false,
    };

    const result = await deliverNotificationEmail(supabase, notification);

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'rohan@example.com',
        toName: 'Rohan Sharma',
        subject: 'New Expression of Interest on DealCollab',
      })
    );
  });

  it('delivers EOI_APPROVED email to the designated user', async () => {
    const mockSend = vi.spyOn(brevoModule, 'sendBrevoEmail').mockResolvedValue({
      providerMessageId: 'msg-abc-456',
    });

    const supabase = mockSupabase({
      id: 'user-2',
      name: 'Priya Patel',
      email: 'priya@example.com',
    });

    const notification: NotificationRow = {
      id: 'notif-2',
      user_id: 'user-2',
      type: 'EOI_APPROVED',
      message: 'Your EOI was accepted by the seller.',
      is_read: false,
    };

    const result = await deliverNotificationEmail(supabase, notification);

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'priya@example.com',
        subject: 'Your EOI was approved — act now',
      })
    );
  });

  it('delivers EOI_DECLINED email to the designated user', async () => {
    const mockSend = vi.spyOn(brevoModule, 'sendBrevoEmail').mockResolvedValue({
      providerMessageId: 'msg-abc-789',
    });

    const supabase = mockSupabase({
      id: 'user-3',
      name: 'Karan Mehra',
      email: 'karan@example.com',
    });

    const notification: NotificationRow = {
      id: 'notif-3',
      user_id: 'user-3',
      type: 'EOI_DECLINED',
      message: 'Your EOI was respectfully declined.',
      is_read: false,
    };

    const result = await deliverNotificationEmail(supabase, notification);

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'karan@example.com',
        subject: 'Expression of Interest Update on DealCollab',
      })
    );
  });

  it('delivers NEW_COUNTERPARTY match email to the designated user', async () => {
    const mockSend = vi.spyOn(brevoModule, 'sendBrevoEmail').mockResolvedValue({
      providerMessageId: 'msg-match-1',
    });

    const supabase = mockSupabase({
      id: 'user-4',
      name: 'Aditi Rao',
      email: 'aditi@example.com',
    });

    const notification: NotificationRow = {
      id: 'notif-4',
      user_id: 'user-4',
      type: 'NEW_COUNTERPARTY',
      message: 'A new counterparty in Pune matches your active mandate.',
      is_read: false,
    };

    const result = await deliverNotificationEmail(supabase, notification);

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'aditi@example.com',
        subject: 'New counterparty match on DealCollab',
      })
    );
  });

  it('skips email delivery for placeholder @dealcollab.ai accounts without failing', async () => {
    const mockSend = vi.spyOn(brevoModule, 'sendBrevoEmail');

    const supabase = mockSupabase({
      id: 'user-5',
      name: 'Phone Only User',
      email: 'phone_919373036910@dealcollab.ai',
    });

    const notification: NotificationRow = {
      id: 'notif-5',
      user_id: 'user-5',
      type: 'EOI_RECEIVED',
      message: 'Some message',
      is_read: false,
    };

    const result = await deliverNotificationEmail(supabase, notification);

    expect(result.success).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
