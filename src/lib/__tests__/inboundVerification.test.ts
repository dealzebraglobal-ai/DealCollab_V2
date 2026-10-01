import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Inbound WhatsApp Verification (Zero-Template)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXTAUTH_SECRET = 'super-secret-testing-key-for-auth-tokens-32chars';
  });

  it('generates a 6-digit inbound session with waUrl and code', async () => {
    const { createInboundVerification, getBotWhatsAppNumber } = await import('../whatsapp/inboundVerification');
    const session = await createInboundVerification();

    expect(session.code).toMatch(/^\d{6}$/);
    expect(session.botNumber).toBe(getBotWhatsAppNumber());
    expect(session.waUrl).toContain(`https://wa.me/${session.botNumber}?text=`);
    expect(session.waUrl).toContain(session.code);
  });

  it('matches incoming WhatsApp message and marks session verified', async () => {
    const { createInboundVerification, checkInboundVerificationStatus, handleInboundVerificationMessage } = await import('../whatsapp/inboundVerification');

    const session = await createInboundVerification({ userId: 'test-user-uuid' });
    expect(session.code).toBeDefined();

    // Status before receiving message
    const beforeStatus = await checkInboundVerificationStatus(session.code);
    expect(beforeStatus.verified).toBe(false);

    // Simulate incoming message sent from user's WhatsApp
    const mockFrom = '919876543210';
    const mockText = `Verify DealCollab ${session.code}`;

    const matchResult = await handleInboundVerificationMessage(mockFrom, mockText);
    expect(matchResult.matched).toBe(true);
    expect(matchResult.phone).toBe('+919876543210');

    // Status after message received
    const afterStatus = await checkInboundVerificationStatus(session.code);
    expect(afterStatus.verified).toBe(true);
    expect(afterStatus.phone).toBe('+919876543210');
    expect(afterStatus.verificationToken).toBeDefined();
  });

  it('rejects unmatched incoming message', async () => {
    const { handleInboundVerificationMessage } = await import('../whatsapp/inboundVerification');
    const res = await handleInboundVerificationMessage('919876543210', 'Just a random message');
    expect(res.matched).toBe(false);
  });
});
