import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { RateLimitResult } from '@/lib/rateLimit';

const checkRateLimitMock = vi.hoisted(() => vi.fn<() => RateLimitResult>(() => ({ allowed: true, remaining: 5, retryAfterMs: 0 })));
const getClientIpMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));

const findFirstMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn(() => ({ set: () => ({ where: vi.fn() }) })));
const insertMock = vi.hoisted(() => vi.fn(() => ({ values: vi.fn() })));

vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: findFirstMock,
      },
    },
    update: updateMock,
    insert: insertMock,
  },
}));

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/whatsapp-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('POST /api/auth/whatsapp-otp — route handler error handling & diagnostics', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, WAPPBIZ_API_KEY: 'test-api-key' };
    findFirstMock.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns 400 when phone number is missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Phone number is required');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterMs: 60000 });
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ phone: '+919999999999' }));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toContain('Too many requests');
  });

  it('returns 503 with WAPPBIZ_CONFIG_MISSING when WAPPBIZ_API_KEY is not set', async () => {
    delete process.env.WAPPBIZ_API_KEY;
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ phone: '+919999999999' }));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.errorCode).toBe('WAPPBIZ_CONFIG_MISSING');
    expect(data.error).toBe('WhatsApp verification service is temporarily unavailable');
  });

  it('returns 200 { success: true } when OTP send succeeds via free-text', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('sendServiceTextMessage')) {
        return jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'txt_msg_1' } });
      }
      throw new Error(`Unexpected call: ${url}`);
    }));

    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ phone: '+919999999999' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 502 with WAPPBIZ_SEND_FAILED when free-text send fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('sendServiceTextMessage')) {
        return jsonResponse({ message: 'Window closed', error: true }, 400);
      }
      throw new Error(`Unexpected call: ${url}`);
    }));

    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ phone: '+919999999999' }));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.errorCode).toBe('WAPPBIZ_SEND_FAILED');
    expect(data.error).toBeTruthy();
  });
});
