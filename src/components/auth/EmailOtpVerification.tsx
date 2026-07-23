'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react';
import OTPInput from './OTPInput';

interface EmailOtpVerificationProps {
  email: string;
  onVerify: (hasPhone: boolean) => void;
  onBack: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;

export default function EmailOtpVerification({ email, onVerify, onBack }: EmailOtpVerificationProps) {
  const { update } = useSession();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = useCallback(async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const verifyRes = await fetch('/api/auth/email-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        console.warn('[EmailOtpVerification] verify failed:', verifyData.error);
        setError(verifyData.error || 'Verification failed');
        setIsLoading(false);
        return;
      }

      console.log('[EmailOtpVerification] OTP verified, creating session...');
      const { signIn } = await import('next-auth/react');
      const result = await signIn('email-otp', { email, redirect: false });

      if (result?.error) {
        console.error('[EmailOtpVerification] signIn failed:', result.error);
        setError('Login failed. Please try again.');
        setIsLoading(false);
        return;
      }

      console.log('[EmailOtpVerification] Session created');
      try {
        await update();
      } catch (updateErr) {
        console.warn('[EmailOtpVerification] session.update() failed (non-fatal):', updateErr);
      }

      console.log('[EmailOtpVerification] Redirecting...');
      onVerify(!!verifyData.hasPhone);
      return;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('[EmailOtpVerification] unexpected error:', err);
      setError(errorMessage);
    }
    setIsLoading(false);
  }, [email, onVerify, update]);

  const handleChange = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setIsResending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/email-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDigits(Array(6).fill(''));
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setError(data.error || 'Failed to resend code');
      }
    } catch {
      setError('Failed to resend code');
    }
    setIsResending(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-700">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-all active:scale-90 text-gray-400 group"
        >
          <ArrowLeft size={18} className="group-hover:text-[#F97316] transition-colors" />
        </button>
        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
          Verify Code
        </span>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100/50 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-500" role="alert">
          <div className="bg-red-500/10 p-1.5 rounded-lg text-red-600">
            <AlertCircle size={18} />
          </div>
          <p className="text-sm font-bold text-red-700 leading-tight">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-[#1F2937] tracking-tight">Enter Code</h3>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">
            Code sent to <span className="text-[#F97316] font-bold">{email}</span>
          </p>
        </div>

        <OTPInput value={digits} onChange={handleChange} onComplete={handleVerify} isLoading={isLoading} />

        <button
          type="button"
          onClick={() => handleVerify(digits.join(''))}
          disabled={isLoading || digits.join('').length !== 6}
          className="w-full bg-[#1F2937] text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#F97316] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all shadow-xl hover:shadow-[#F97316]/20 disabled:opacity-50"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            'Verify & Login'
          )}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isResending}
            className="text-xs font-bold text-gray-400 hover:text-[#F97316] transition-colors disabled:opacity-50 disabled:hover:text-gray-400"
          >
            {isResending ? 'Sending...' : cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Resend Code'}
          </button>
        </div>
      </div>

      <div className="pt-6 border-t border-gray-50 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-gray-400">
          <ShieldCheck size={14} className="text-green-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Institutional Privacy Standard</span>
        </div>
      </div>
    </div>
  );
}
