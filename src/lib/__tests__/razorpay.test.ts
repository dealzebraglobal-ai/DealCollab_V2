import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifyPaymentSignature, verifyWebhookSignature } from '../razorpay';

describe('verifyPaymentSignature', () => {
  const ORIGINAL_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const ORIGINAL_KEY_ID = process.env.RAZORPAY_KEY_ID;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
    process.env.RAZORPAY_KEY_SECRET = 'test_secret_value';
  });
  afterEach(() => {
    process.env.RAZORPAY_KEY_SECRET = ORIGINAL_SECRET;
    process.env.RAZORPAY_KEY_ID = ORIGINAL_KEY_ID;
  });

  function realSignature(orderId: string, paymentId: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  }

  it('accepts a correctly computed signature (the official Razorpay algorithm)', () => {
    const signature = realSignature('order_ABC123', 'pay_XYZ789', 'test_secret_value');
    expect(verifyPaymentSignature({ orderId: 'order_ABC123', paymentId: 'pay_XYZ789', signature })).toBe(true);
  });

  it('rejects a signature computed with the wrong secret (forged callback)', () => {
    const signature = realSignature('order_ABC123', 'pay_XYZ789', 'wrong_secret');
    expect(verifyPaymentSignature({ orderId: 'order_ABC123', paymentId: 'pay_XYZ789', signature })).toBe(false);
  });

  it('rejects a signature for a different order/payment id pair (replay against another order)', () => {
    const signature = realSignature('order_ABC123', 'pay_XYZ789', 'test_secret_value');
    expect(verifyPaymentSignature({ orderId: 'order_DIFFERENT', paymentId: 'pay_XYZ789', signature })).toBe(false);
  });

  it('rejects a garbage/empty signature rather than throwing', () => {
    expect(verifyPaymentSignature({ orderId: 'order_ABC123', paymentId: 'pay_XYZ789', signature: '' })).toBe(false);
    expect(verifyPaymentSignature({ orderId: 'order_ABC123', paymentId: 'pay_XYZ789', signature: 'not-hex-and-wrong-length' })).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  const ORIGINAL = process.env.RAZORPAY_WEBHOOK_SECRET;
  beforeEach(() => { process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret_value'; });
  afterEach(() => { process.env.RAZORPAY_WEBHOOK_SECRET = ORIGINAL; });

  function realSig(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  }

  it('accepts a signature computed over the exact raw body', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const sig = realSig(body, 'webhook_secret_value');
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it('rejects when the body is tampered with after signing (even one byte)', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const sig = realSig(body, 'webhook_secret_value');
    const tampered = body.replace('captured', 'refunded');
    expect(verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it('fails closed when RAZORPAY_WEBHOOK_SECRET is not configured', () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(verifyWebhookSignature(body, 'anything')).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });
});
