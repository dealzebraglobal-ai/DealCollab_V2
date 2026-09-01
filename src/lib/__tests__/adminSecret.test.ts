import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isValidAdminSecret } from '../adminSecret';

describe('isValidAdminSecret', () => {
  const ORIGINAL = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = 'test-admin-secret-value';
  });

  afterEach(() => {
    process.env.ADMIN_API_KEY = ORIGINAL;
  });

  it('accepts the correct secret', () => {
    expect(isValidAdminSecret('test-admin-secret-value')).toBe(true);
  });

  it('rejects an incorrect secret', () => {
    expect(isValidAdminSecret('wrong-secret')).toBe(false);
  });

  it('rejects a null header', () => {
    expect(isValidAdminSecret(null)).toBe(false);
  });

  it('rejects everything when ADMIN_API_KEY is unset (fails closed, not open)', () => {
    delete process.env.ADMIN_API_KEY;
    expect(isValidAdminSecret('anything')).toBe(false);
    expect(isValidAdminSecret('')).toBe(false);
  });

  it('does not let an empty header match an empty/unset expected value', () => {
    delete process.env.ADMIN_API_KEY;
    expect(isValidAdminSecret('')).toBe(false);
  });
});
