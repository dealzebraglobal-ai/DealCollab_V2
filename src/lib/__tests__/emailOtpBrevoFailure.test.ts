import { describe, it, expect } from 'vitest';
import { classifyBrevoFailure } from '../emailOtp';

/**
 * Regression test for distinguishing Brevo failure reasons (2026-08-26).
 * Brevo returns HTTP 401 with the same `"code":"unauthorized"` for BOTH an
 * invalid API key and an IP-not-on-the-allowlist rejection — only the
 * human-readable `message` text differs, so that's what classification has
 * to key on. Confirmed against the real 401 body Brevo returned in
 * production/local testing:
 *   { "message": "We have detected you are using an unrecognised IP
 *     address 103.35.133.98. ... add the new IP address in this link:
 *     https://app.brevo.com/security/authorised_ips", "code": "unauthorized" }
 */
describe('classifyBrevoFailure', () => {
  it('classifies the real observed IP-authorization 401 body correctly', () => {
    const body = JSON.stringify({
      message:
        'We have detected you are using an unrecognised IP address 103.35.133.98. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips',
      code: 'unauthorized',
    });
    expect(classifyBrevoFailure(401, body)).toBe('ip_not_authorized');
  });

  it('classifies a 401 with no IP-related message as an invalid API key', () => {
    const body = JSON.stringify({ message: 'Key not found', code: 'unauthorized' });
    expect(classifyBrevoFailure(401, body)).toBe('invalid_api_key');
  });

  it('classifies a 400 invalid_parameter as a sender/template error', () => {
    const body = JSON.stringify({ message: 'Sender not valid', code: 'invalid_parameter' });
    expect(classifyBrevoFailure(400, body)).toBe('sender_or_template_error');
  });

  it('classifies HTTP 429 as rate limited regardless of body', () => {
    expect(classifyBrevoFailure(429, '')).toBe('rate_limited');
  });

  it('falls back to "other" for an unrecognized status/body combination', () => {
    expect(classifyBrevoFailure(500, 'Internal Server Error')).toBe('other');
  });

  it('falls back gracefully when the body is not valid JSON', () => {
    expect(classifyBrevoFailure(401, 'not json')).toBe('invalid_api_key');
  });
});
