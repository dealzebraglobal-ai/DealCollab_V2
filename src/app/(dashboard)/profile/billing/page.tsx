'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Script from 'next/script';
import {
  Coins, CreditCard, TrendingUp, ShieldCheck, Tag, X, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { parseJsonResponse } from '@/lib/fetchJson';
import {
  trackPaymentStarted, trackPromoCodeAttempted, trackPromoCodeApplied,
  trackPaymentSuccess, trackPaymentFailed, trackTokenPurchase,
} from '@/lib/analytics';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  priceInr: number;
  currency: string;
}

interface PromoValidation {
  valid: boolean;
  originalAmountInr?: number;
  discountAmountInr?: number;
  finalAmountInr?: number;
  tokenBonus?: number;
  error?: string;
}

type PurchaseState = 'idle' | 'loading' | 'processing' | 'success' | 'failed';

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: amount % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export default function BillingPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoValidation, setPromoValidation] = useState<PromoValidation | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [razorpayReady, setRazorpayReady] = useState(false);

  const selectedPackage = packages.find((p) => p.id === selectedPackageId) || null;

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/users/tokens');
      const data = await parseJsonResponse<{ balance?: number }>(res);
      if (typeof data.balance === 'number') setBalance(data.balance);
    } catch {
      // Balance display is best-effort — a failure here doesn't block purchasing.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await refreshBalance();

      try {
        const res = await fetch('/api/payments/packages');
        const data = await parseJsonResponse<{ packages?: TokenPackage[] }>(res);
        if (!cancelled) setPackages(data.packages || []);
      } catch {
        if (!cancelled) setPackages([]);
      } finally {
        if (!cancelled) setPackagesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [refreshBalance]);

  const handleValidatePromo = useCallback(async () => {
    if (!selectedPackage || !promoCode.trim()) return;
    trackPromoCodeAttempted(selectedPackage.id);
    setPromoChecking(true);
    setPromoValidation(null);
    try {
      const res = await fetch('/api/payments/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: selectedPackage.id, promoCode: promoCode.trim() }),
      });
      const data = await parseJsonResponse<PromoValidation>(res);
      setPromoValidation(data);
      if (data.valid && typeof data.discountAmountInr === 'number') {
        trackPromoCodeApplied(selectedPackage.id, data.discountAmountInr);
      }
    } catch (err) {
      setPromoValidation({ valid: false, error: err instanceof Error ? err.message : 'Unable to validate promo code' });
    } finally {
      setPromoChecking(false);
    }
  }, [selectedPackage, promoCode]);

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage || purchaseState === 'loading' || purchaseState === 'processing') return;

    setErrorMessage(null);
    setPurchaseState('loading');
    trackPaymentStarted(selectedPackage.id);

    try {
      const res = await fetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          ...(promoValidation?.valid ? { promoCode: promoCode.trim() } : {}),
        }),
      });
      const data = await parseJsonResponse<{
        success: boolean; error?: string; free?: boolean; newBalance?: number;
        orderId?: string; amountPaise?: number; currency?: string; paymentId?: string; keyId?: string;
      }>(res);

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Unable to start payment');
        setPurchaseState('failed');
        trackPaymentFailed(selectedPackage.id, data.error);
        return;
      }

      // Free redemption (100% discount) — no Razorpay checkout needed at all.
      if (data.free) {
        setPurchaseState('success');
        if (typeof data.newBalance === 'number') setBalance(data.newBalance);
        trackTokenPurchase(selectedPackage.id, selectedPackage.tokens);
        return;
      }

      if (!data.orderId || !data.keyId || !data.paymentId) {
        setErrorMessage('Payment order was not created correctly.');
        setPurchaseState('failed');
        return;
      }

      if (!window.Razorpay) {
        setErrorMessage('Payment system is still loading — please try again in a moment.');
        setPurchaseState('failed');
        return;
      }

      setPurchaseState('processing');
      const orderId = data.orderId;
      const paymentIdInternal = data.paymentId;

      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: orderId,
        amount: data.amountPaise,
        currency: data.currency,
        name: 'DealCollab AI',
        description: `${selectedPackage.name} — ${selectedPackage.tokens} tokens`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch('/api/payments/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentId: paymentIdInternal,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            const verifyData = await parseJsonResponse<{ success: boolean; error?: string; newBalance?: number }>(verifyRes);

            if (!verifyRes.ok || !verifyData.success) {
              setErrorMessage(verifyData.error || 'Payment verification failed');
              setPurchaseState('failed');
              trackPaymentFailed(selectedPackage.id, verifyData.error);
              return;
            }

            setPurchaseState('success');
            if (typeof verifyData.newBalance === 'number') setBalance(verifyData.newBalance);
            trackPaymentSuccess(selectedPackage.id, selectedPackage.priceInr);
            trackTokenPurchase(selectedPackage.id, selectedPackage.tokens);
          } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Payment verification failed');
            setPurchaseState('failed');
          }
        },
        modal: {
          ondismiss: () => {
            // User closed the checkout without paying — not a failure, just back to idle.
            setPurchaseState('idle');
          },
        },
        theme: { color: '#F97316' },
      });
      rzp.open();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to start payment');
      setPurchaseState('failed');
    }
  }, [selectedPackage, promoValidation, promoCode, purchaseState]);

  const isProcessing = purchaseState === 'loading' || purchaseState === 'processing';

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-white relative overflow-y-auto">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setRazorpayReady(true)}
      />

      <div className="max-w-4xl mx-auto w-full p-6 sm:p-10 space-y-12 pb-24">
        <div>
          <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Billing & Tokens</h1>
          <p className="text-[#6B7280] text-sm font-medium mt-1">Manage your platform credits and subscription</p>
        </div>

        {/* TOKEN BALANCE — server-authoritative, refreshed after every purchase */}
        <div className="bg-[#1F2937] rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#F97316]/20 to-transparent rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div>
              <p className="text-[#9CA3AF] text-xs font-black uppercase tracking-[0.2em] mb-3">Available Credits</p>
              <div className="flex items-baseline gap-3">
                <span className="text-6xl font-bold tabular-nums">{balance ?? '—'}</span>
                <span className="text-[#F97316] text-xl font-bold">Tokens</span>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex items-center gap-4">
              <div className="bg-[#F97316] p-2 rounded-lg text-white"><Coins size={20} /></div>
              <div>
                <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Usage Status</p>
                <p className="text-sm font-bold text-white">Optimal Account Health</p>
              </div>
            </div>
          </div>
        </div>

        {/* PACKAGES */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#1F2937]">Select Token Package</h2>
            <span className="text-xs font-bold text-[#F97316] bg-[#F97316]/10 px-3 py-1 rounded-full">Secure Payment via Razorpay</span>
          </div>

          {packagesLoading ? (
            <p className="text-sm text-gray-400 font-medium">Loading packages…</p>
          ) : packages.length === 0 ? (
            <div className="bg-gray-50 rounded-[32px] p-10 text-center border border-gray-100">
              <CreditCard className="mx-auto text-gray-300 mb-4" size={32} />
              <p className="text-sm font-bold text-gray-500">Token packages are not available yet.</p>
              <p className="text-xs text-gray-400 mt-1">Check back soon — pricing is being finalized.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {packages.map((pkg, idx) => (
                <button
                  key={pkg.id}
                  onClick={() => { setSelectedPackageId(pkg.id); setPromoValidation(null); setPromoCode(''); }}
                  className={`relative flex flex-col p-8 rounded-[32px] border-2 transition-all duration-300 text-left group ${
                    selectedPackageId === pkg.id
                      ? 'border-[#F97316] bg-white shadow-xl scale-[1.02]'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-colors ${
                    selectedPackageId === pkg.id ? 'bg-[#F97316] text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100'
                  }`}>
                    {idx === 0 ? <TrendingUp size={20} /> : <ShieldCheck size={20} />}
                  </div>
                  <div className="mb-8">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{pkg.name}</p>
                    <p className="text-3xl font-bold text-[#1F2937]">{pkg.tokens} Tokens</p>
                  </div>
                  <div className="mt-auto pt-8 border-t border-gray-50 flex items-baseline gap-2">
                    <p className="text-4xl font-black text-[#1F2937]">{formatInr(pkg.priceInr)}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">One-time</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* PROMO + CHECKOUT */}
        {selectedPackage && (
          <div className="bg-gray-50 rounded-[32px] p-8 space-y-6 border border-gray-100">
            <div className="flex items-center gap-3">
              <Tag size={18} className="text-gray-400" />
              <input
                type="text"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoValidation(null); }}
                placeholder="Promo code (optional)"
                disabled={isProcessing}
                className="flex-1 bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-bold text-[#1F2937] focus:border-[#F97316] outline-none disabled:opacity-50"
              />
              <button
                onClick={handleValidatePromo}
                disabled={!promoCode.trim() || promoChecking || isProcessing}
                className="px-5 py-3 bg-[#1F2937] text-white rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-40"
              >
                {promoChecking ? 'Checking…' : 'Apply'}
              </button>
              {promoValidation && (
                <button onClick={() => { setPromoValidation(null); setPromoCode(''); }} className="p-2 text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
            </div>

            {promoValidation && (
              <div className={`flex items-center gap-2 text-sm font-bold ${promoValidation.valid ? 'text-green-600' : 'text-red-500'}`}>
                {promoValidation.valid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {promoValidation.valid
                  ? `Promo applied — you save ${formatInr(promoValidation.discountAmountInr || 0)}`
                  : promoValidation.error || 'Invalid promo code'}
              </div>
            )}

            {/* Price breakdown — every number here comes from the server, never computed client-side */}
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <div className="flex justify-between text-sm text-gray-500 font-medium">
                <span>{selectedPackage.name} — {selectedPackage.tokens} Tokens</span>
                <span>{formatInr(promoValidation?.valid ? (promoValidation.originalAmountInr ?? selectedPackage.priceInr) : selectedPackage.priceInr)}</span>
              </div>
              {promoValidation?.valid && (
                <div className="flex justify-between text-sm text-green-600 font-bold">
                  <span>Discount</span>
                  <span>-{formatInr(promoValidation.discountAmountInr || 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-black text-[#1F2937] pt-2 border-t border-gray-200">
                <span>Final Amount</span>
                <span>{formatInr(promoValidation?.valid ? (promoValidation.finalAmountInr ?? selectedPackage.priceInr) : selectedPackage.priceInr)}</span>
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 text-sm font-bold text-red-500 bg-red-50 rounded-2xl p-4">
                <AlertCircle size={16} /> {errorMessage}
              </div>
            )}

            {purchaseState === 'success' ? (
              <div className="flex items-center justify-center gap-2 text-sm font-black text-green-600 bg-green-50 rounded-2xl p-5">
                <CheckCircle2 size={18} /> Purchase successful — tokens credited to your account.
              </div>
            ) : (
              <button
                onClick={handlePurchase}
                disabled={isProcessing || (!razorpayReady && promoValidation?.finalAmountInr !== 0)}
                className="w-full py-5 bg-[#F97316] text-white rounded-[20px] text-sm font-black uppercase tracking-[0.2em] shadow-xl hover:shadow-[#F97316]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
              >
                {purchaseState === 'loading' ? 'Starting Payment…'
                  : purchaseState === 'processing' ? 'Payment Processing…'
                  : purchaseState === 'failed' ? 'Try Again'
                  : <>Proceed to Payment <CreditCard size={18} /></>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
