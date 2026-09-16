import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression tests for the production log pair:
 *   [Wappbiz error] /sendServiceButtonMessage returned a non-JSON response (HTTP 404)
 *   [WAPPBIZ INTERACTIVE] send FAILED — status=0 reason="Wappbiz returned a malformed response".
 *
 * Two real bugs, both fixed here:
 *  1. `status=0` in that log line proves the non-JSON-response branch of
 *     wappBizRequest() never propagated the HTTP status onto the returned
 *     result. Because sendWappBizButtons' self-disable check is
 *     `res.status === 404`, a non-JSON 404 (an HTML/plain 404 page, not a
 *     JSON envelope — the realistic shape of "route does not exist") could
 *     never trip self-disable, so the dead endpoint was retried forever.
 *  2. `/sendServiceButtonMessage` is undocumented and confirmed 404 in
 *     production, but the code silently defaulted to calling it anyway on
 *     every button-send unless an operator had actively set
 *     WAPPBIZ_BUTTONS_DISABLED=1. It must now default to skipped unless an
 *     operator has explicitly confirmed a real endpoint via
 *     WAPPBIZ_BUTTONS_ENDPOINT.
 */
describe('WappBiz interactive buttons — endpoint config, malformed responses, fallback', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.WAPPBIZ_API_KEY = 'test-key';
    delete process.env.WAPPBIZ_BUTTONS_ENDPOINT;
    delete process.env.WAPPBIZ_BUTTONS_DISABLED;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }
  function htmlResponse(body: string, status: number): Response {
    return new Response(body, { status, headers: { 'content-type': 'text/html' } });
  }

  it('with NO confirmed button endpoint configured: skips the network call entirely and sends numbered text', async () => {
    const fetchSpy = vi.fn(async (_url: string) => jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'm1' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const { sendWappBizButtons } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizButtons('+919999999999', 'Pick one', [
      { id: 'A', title: 'Option A' },
      { id: 'B', title: 'Option B' },
    ]);

    const calledUrls = fetchSpy.mock.calls.map((c) => c[0]);
    // Only the numbered-text fallback is sent — the unconfirmed button endpoint is never called.
    expect(calledUrls.every((url) => url.includes('sendServiceTextMessage'))).toBe(true);
    expect(calledUrls.some((url) => url.includes('sendServiceButtonMessage'))).toBe(false);
    expect(result.success).toBe(true);
  });

  it('with a confirmed endpoint configured: sends the interactive request and succeeds on a valid JSON response', async () => {
    process.env.WAPPBIZ_BUTTONS_ENDPOINT = '/sendServiceButtonMessage';
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'm1' } });
      }),
    );

    const { sendWappBizButtons } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizButtons('+919999999999', 'Pick one', [{ id: 'A', title: 'Option A' }]);

    expect(result.success).toBe(true);
    expect(calls.some((u) => u.includes('/sendServiceButtonMessage'))).toBe(true);
  });

  it('a non-JSON 404 response propagates status=404 and self-disables the endpoint for the rest of the process', async () => {
    process.env.WAPPBIZ_BUTTONS_ENDPOINT = '/sendServiceButtonMessage';
    let buttonCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('sendServiceButtonMessage')) {
          buttonCallCount += 1;
          return htmlResponse('<html><body>404 Not Found</body></html>', 404);
        }
        return jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'm1' } });
      }),
    );

    const wappbiz = await import('../whatsapp/wappbiz');
    expect(wappbiz.__isInteractiveButtonsDisabled()).toBe(false);

    const first = await wappbiz.sendWappBizButtons('+919999999999', 'Pick one', [{ id: 'A', title: 'A' }]);
    // Falls back to numbered text, delivered as a normal service text message.
    expect(first.success).toBe(true);
    expect(wappbiz.__isInteractiveButtonsDisabled()).toBe(true);
    expect(buttonCallCount).toBe(1);

    await wappbiz.sendWappBizButtons('+919999999999', 'Pick another', [{ id: 'B', title: 'B' }]);
    // Self-disabled — the broken endpoint must not be hit again this process.
    expect(buttonCallCount).toBe(1);
  });

  it('a malformed (non-JSON, non-HTML) response is reported as malformed, not silently swallowed, and still falls back', async () => {
    process.env.WAPPBIZ_BUTTONS_ENDPOINT = '/sendServiceButtonMessage';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('sendServiceButtonMessage')) {
          return new Response('not json at all', { status: 200, headers: { 'content-type': 'text/plain' } });
        }
        return jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'm1' } });
      }),
    );

    const { sendWappBizButtons } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizButtons('+919999999999', 'Pick one', [{ id: 'A', title: 'A' }]);

    expect(result.success).toBe(true); // fallback still delivers a usable reply
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('non-JSON response');
  });

  it('a request-level timeout (fetch rejects with AbortError) is caught cleanly and reported, not thrown', async () => {
    // Simulates REQUEST_TIMEOUT_MS firing, without waiting out the real 15s —
    // fetch rejecting with AbortError is exactly what AbortController.abort()
    // produces, regardless of what triggered it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );

    const { sendWappBizMessage } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizMessage('+919999999999', 'hello');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Wappbiz request timed out');
  });

  it('an invalid WAPPBIZ_BUTTONS_ENDPOINT (not starting with "/") is rejected with a clear config error and buttons stay disabled', async () => {
    process.env.WAPPBIZ_BUTTONS_ENDPOINT = 'sendServiceButtonMessage'; // missing leading slash
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn(async (_url: string) => jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'm1' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const { sendWappBizButtons, __isInteractiveButtonsDisabled } = await import('../whatsapp/wappbiz');
    expect(__isInteractiveButtonsDisabled()).toBe(true);

    const result = await sendWappBizButtons('+919999999999', 'Pick one', [{ id: 'A', title: 'A' }]);
    expect(fetchSpy.mock.calls.map((c) => c[0]).some((url) => url.includes('sendServiceButtonMessage'))).toBe(false);
    expect(result.success).toBe(true);
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('WAPPBIZ_BUTTONS_ENDPOINT');
  });

  it('WAPPBIZ_BUTTONS_DISABLED=1 skips the call even when an endpoint is configured', async () => {
    process.env.WAPPBIZ_BUTTONS_ENDPOINT = '/sendServiceButtonMessage';
    process.env.WAPPBIZ_BUTTONS_DISABLED = '1';
    const fetchSpy = vi.fn(async (_url: string) => jsonResponse({ message: 'ok', status: 200, error: false, data: { message_id: 'm1' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const { sendWappBizButtons } = await import('../whatsapp/wappbiz');
    const result = await sendWappBizButtons('+919999999999', 'Pick one', [{ id: 'A', title: 'A' }]);

    expect(fetchSpy.mock.calls.map((c) => c[0]).some((url) => url.includes('sendServiceButtonMessage'))).toBe(false);
    expect(result.success).toBe(true);
  });

  it('never logs the API key when reporting a failure', async () => {
    process.env.WAPPBIZ_BUTTONS_ENDPOINT = '/sendServiceButtonMessage';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('not found', 404)));

    const { sendWappBizButtons } = await import('../whatsapp/wappbiz');
    await sendWappBizButtons('+919999999999', 'Pick one', [{ id: 'A', title: 'A' }]);

    const allLogged = [...errorSpy.mock.calls, ...logSpy.mock.calls].flat().map(String).join(' ');
    expect(allLogged).not.toContain('test-key');
  });
});
