import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('sendWappBizOTP — smart dual-path OTP delivery', () => {
  const ORIGINAL_KEY = process.env.WAPPBIZ_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.WAPPBIZ_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.WAPPBIZ_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  it('Test A: fails with WAPPBIZ_CONFIG_MISSING when WAPPBIZ_API_KEY is missing', async () => {
    delete process.env.WAPPBIZ_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizOTP('+919999999999', '123456');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('WAPPBIZ_CONFIG_MISSING');
    expect(result.error).toContain('WAPPBIZ_API_KEY is not set');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Test B: delivers OTP directly via sendServiceTextMessage when recipient has open window', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('sendServiceTextMessage')) {
        return jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'txt_msg_200' } });
      }
      throw new Error(`Unexpected call: ${url}`);
    }));

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizOTP('+919999999999', '123456');

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('txt_msg_200');
    expect(calls.some((u) => u.includes('sendServiceTextMessage'))).toBe(true);
  });

  it('Test C: provides clear actionable error when window is closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('sendServiceTextMessage')) {
        return jsonResponse({ message: 'Customer not found or window closed' }, 404);
      }
      throw new Error(`Unexpected call: ${url}`);
    }));

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizOTP('+919999999999', '123456');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('WAPPBIZ_SEND_FAILED');
    expect(result.error).toContain('WhatsApp 24h window closed');
  });

  it('Test E: OTP verification helper behaves correctly (validates real code, rejects incorrect, enforces attempts)', async () => {
    const { validateOtp } = await import('../otp');
    const { hashOtp } = await import('../emailOtp');

    const plainOtp = '654321';
    const hashed = hashOtp(plainOtp);
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    // 1. Valid code
    const validResult = validateOtp({
      submittedCode: hashed,
      storedCode: hashed,
      storedExpires: expires,
      attemptsSoFar: 0,
    });
    expect(validResult.valid).toBe(true);

    // 2. Incorrect code
    const wrongResult = validateOtp({
      submittedCode: hashOtp('111111'),
      storedCode: hashed,
      storedExpires: expires,
      attemptsSoFar: 0,
    });
    expect(wrongResult.valid).toBe(false);
    if (!wrongResult.valid) {
      expect(wrongResult.reason).toBe('incorrect');
    }

    // 3. Expired code
    const expiredResult = validateOtp({
      submittedCode: hashed,
      storedCode: hashed,
      storedExpires: new Date(Date.now() - 1000),
      attemptsSoFar: 0,
    });
    expect(expiredResult.valid).toBe(false);
    if (!expiredResult.valid) {
      expect(expiredResult.reason).toBe('expired');
    }

    // 4. Too many attempts
    const lockedResult = validateOtp({
      submittedCode: hashed,
      storedCode: hashed,
      storedExpires: expires,
      attemptsSoFar: 5,
    });
    expect(lockedResult.valid).toBe(false);
    if (!lockedResult.valid) {
      expect(lockedResult.reason).toBe('too_many_attempts');
    }
  });

  it('Security: never logs sensitive data in production', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('sendServiceTextMessage') || url.includes('sendAuthTemplate')) {
        return jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'txt_msg_100' } });
      }
      throw new Error('unexpected');
    }));

    const secretPhone = '+919876543210';
    process.env.WAPPBIZ_API_KEY = 'secret-api-key-value-12345';

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    await sendWappBizOTP(secretPhone, '654321');

    const allLoggedText = [
      ...errorSpy.mock.calls.flat().map((a) => String(a)),
      ...logSpy.mock.calls.flat().map((a) => String(a)),
    ].join(' ');

    expect(allLoggedText).not.toContain(secretPhone);
    expect(allLoggedText).not.toContain('secret-api-key-value-12345');
  });
});
