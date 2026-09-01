import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression tests for WhatsApp OTP delivery (2026-08-28 correction).
 *
 * An earlier version of sendWappBizOTP fell back to free-text delivery
 * (sendServiceTextMessage) gated on checkCustomerWindow — i.e. it only
 * worked for a number that had already messaged the business within 24h.
 * That is NOT the required behavior: WhatsApp OTP login must work for ANY
 * valid phone number, including a brand-new one that has never contacted
 * WappBiz, exactly like the existing Email OTP flow works for any email.
 * REMOVED that fallback entirely — delivery is now template-only, and
 * fails cleanly (not silently, not via an invented workaround) when no
 * approved template exists.
 */
describe('sendWappBizOTP — template-only delivery, no window/fallback dependency', () => {
  const ORIGINAL_KEY = process.env.WAPPBIZ_API_KEY;
  const ORIGINAL_TEMPLATE = process.env.WAPPBIZ_OTP_TEMPLATE_NAME;

  beforeEach(() => {
    vi.resetModules();
    process.env.WAPPBIZ_API_KEY = 'test-key';
    delete process.env.WAPPBIZ_OTP_TEMPLATE_NAME;
  });

  afterEach(() => {
    process.env.WAPPBIZ_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_TEMPLATE) process.env.WAPPBIZ_OTP_TEMPLATE_NAME = ORIGINAL_TEMPLATE;
    else delete process.env.WAPPBIZ_OTP_TEMPLATE_NAME;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  it('sends via sendAuthTemplate when an approved template exists — no window check at all', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('fetchAuthTemplates')) {
        return jsonResponse({ message: 'ok', status: 200, error: false, data: [{ template_id: '1', template_name: 'otp_login' }] });
      }
      if (url.includes('sendAuthTemplate')) {
        return jsonResponse({ message: 'ok', status: 200, error: false, data: { _id: '1', template_id: '1', template_name: 'otp_login' } });
      }
      throw new Error(`Unexpected call: ${url}`);
    }));

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizOTP('+919999999999', '123456');

    expect(result.success).toBe(true);
    expect(calls.some((u) => u.includes('sendAuthTemplate'))).toBe(true);
    // The whole point of this correction: no window check, ever, for OTP delivery.
    expect(calls.some((u) => u.includes('checkCustomerWindow'))).toBe(false);
    expect(calls.some((u) => u.includes('sendServiceTextMessage'))).toBe(false);
  });

  it('works for a number that has NEVER messaged the business (Test C from the spec) — succeeds purely on the template path', async () => {
    // Simulates a brand-new WhatsApp number with zero prior interaction.
    // No checkCustomerWindow call should ever be made or matter.
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('fetchAuthTemplates')) {
        return jsonResponse({ data: [{ template_id: '1', template_name: 'otp_login' }] });
      }
      if (url.includes('sendAuthTemplate')) {
        return jsonResponse({ data: { _id: '1', template_id: '1', template_name: 'otp_login' } });
      }
      throw new Error(`Unexpected call (window/fallback path should not be reached): ${url}`);
    }));

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizOTP('+910000000001', '999999');
    expect(result.success).toBe(true);
  });

  it('fails cleanly with an actionable error when no approved template exists — does NOT fall back to free-text/window check', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('fetchAuthTemplates')) {
        return jsonResponse({ message: 'ok', status: 200, error: false, data: [] });
      }
      throw new Error(`Unexpected call (must not attempt any fallback): ${url}`);
    }));

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizOTP('+919999999999', '123456');

    expect(result.success).toBe(false);
    expect(result.error).toContain('authentication template');
    // Must not have called checkCustomerWindow or sendServiceTextMessage as a fallback.
    expect(calls.some((u) => u.includes('checkCustomerWindow'))).toBe(false);
    expect(calls.some((u) => u.includes('sendServiceTextMessage'))).toBe(false);
  });

  it('respects WAPPBIZ_OTP_TEMPLATE_NAME override without calling fetchAuthTemplates', async () => {
    process.env.WAPPBIZ_OTP_TEMPLATE_NAME = 'pinned_template';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('sendAuthTemplate')) {
        return jsonResponse({ data: { _id: '1', template_id: '1', template_name: 'pinned_template' } });
      }
      throw new Error(`Unexpected call: ${url}`);
    }));

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizOTP('+919999999999', '123456');

    expect(result.success).toBe(true);
    expect(calls.some((u) => u.includes('fetchAuthTemplates'))).toBe(false);
  });

  it('never logs the OTP value, even on failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('fetchAuthTemplates')) return jsonResponse({ data: [] });
      throw new Error('unexpected');
    }));

    const { sendWappBizOTP } = await import('../whatsapp/wappbiz');
    await sendWappBizOTP('+919999999999', '654321');

    const allLoggedText = errorSpy.mock.calls.flat().map((a) => String(a)).join(' ');
    expect(allLoggedText).not.toContain('654321');
  });
});
