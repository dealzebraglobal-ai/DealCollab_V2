'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { Smartphone, ArrowRight, ShieldCheck, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import OTPInput from './OTPInput';
import { parseJsonResponse } from '@/lib/fetchJson';

interface PhoneVerificationProps {
  onVerify: () => void;
  onBack: () => void;
  initialPhone?: string | null;
  isFromWhatsApp?: boolean;
}

const RESEND_COOLDOWN_SECONDS = 30;

export default function PhoneVerification({ onVerify, onBack, initialPhone }: PhoneVerificationProps) {
  const [phone, setPhone] = useState(initialPhone || '');
  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = useState(false);

  const { data: session, update } = useSession();

  useEffect(() => {
    if (cooldown <= 0 || step !== 'otp') return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown, step]);

  const formatPhone = useCallback(() => {
    const cleaned = phone.replace(/[^\d+]/g, '');
    return cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;
  }, [phone]);

  const requestOtp = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!phone.trim()) return;

    const formattedPhone = formatPhone();
    const digitsOnly = formattedPhone.replace(/\D/g, '');

    if (digitsOnly.length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const res = await fetch('/api/auth/whatsapp-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone }),
      });
      
      const data = await parseJsonResponse<{ success?: boolean; error?: string }>(res);
      if (!res.ok) {
        setError(data.error || "Failed to send WhatsApp verification code");
        return;
      }
      
      setStep('otp');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = useCallback(async (code: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const formattedPhone = formatPhone();
      
      const verifyRes = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, code }),
      });
      
      const verifyData = await parseJsonResponse<{ error?: string; verificationToken?: string }>(verifyRes);
      
      if (!verifyRes.ok) {
        setError(verifyData.error || 'Verification failed');
        setIsLoading(false);
        return;
      }

      if (session) {
        // Link phone to account
        const saveRes = await fetch('/api/auth/save-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            phone: formattedPhone,
            verificationToken: verifyData.verificationToken
          }),
        });
        const saveData = await parseJsonResponse<{ success?: boolean; error?: string }>(saveRes);
        
        if (!saveRes.ok || !saveData.success) {
          setError(saveData.error || "Failed to link phone number");
          setIsLoading(false);
          return;
        }

        try {
          await update();
        } catch (updateErr) {
          console.warn("[PhoneVerification] session.update() failed (non-fatal):", updateErr);
        }
      }

      setIsSuccess(true);
      setTimeout(() => {
        onVerify();
      }, 600);
      
    } catch (err: unknown) {
      console.error("[PhoneVerification] Verification error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsLoading(false);
    }
  }, [phone, session, update, onVerify, formatPhone]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setIsResending(true);
    await requestOtp();
    setIsResending(false);
  };

  const handleChange = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  if (step === 'otp') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-700">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setStep('input')}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-all active:scale-90 text-gray-400 group"
          >
            <ArrowLeft size={18} className="group-hover:text-[#F97316] transition-colors" />
          </button>
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
            WhatsApp Verification
          </span>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100/50 rounded-2xl flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <div className="bg-red-500/10 p-1.5 rounded-lg text-red-600 shrink-0 mt-0.5">
                <AlertCircle size={18} />
              </div>
              <p className="text-xs font-bold text-red-700 leading-tight flex-1">{error}</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xl font-bold text-[#1F2937] tracking-tight">Enter Code</h3>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">
            We sent a verification code to <span className="text-[#1F2937] font-semibold">{formatPhone()}</span> via WhatsApp.
          </p>
        </div>

        <div className="flex justify-center w-full py-4">
          <OTPInput
            value={digits}
            onChange={handleChange}
            onComplete={verifyOtp}
            isLoading={isLoading}
          />
        </div>

        <div className="flex flex-col items-center gap-4 mt-6">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isLoading || isResending}
            className="text-sm font-semibold text-gray-500 hover:text-[#F97316] transition-colors disabled:opacity-50 disabled:hover:text-gray-500"
          >
            {isResending ? 'Resending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend WhatsApp Code'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-700">
      <div className="flex items-center gap-3">
        <button 
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-all active:scale-90 text-gray-400 group"
        >
          <ArrowLeft size={18} className="group-hover:text-[#F97316] transition-colors" />
        </button>
        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
          Contact Setup
        </span>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100/50 rounded-2xl flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-start gap-3">
            <div className="bg-red-500/10 p-1.5 rounded-lg text-red-600 shrink-0 mt-0.5">
              <AlertCircle size={18} />
            </div>
            <div className="space-y-1.5 flex-1">
              <p className="text-xs font-bold text-red-700 leading-tight">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {isSuccess ? (
        <div className="p-8 text-center space-y-4 bg-green-50/80 border border-green-200/60 rounded-[28px] animate-in zoom-in duration-500">
          <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-500/20">
            <CheckCircle2 size={32} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-green-900">Phone Verified!</h3>
            <p className="text-xs text-green-700 font-medium">Your profile has been updated. Proceeding...</p>
          </div>
        </div>
      ) : (
        <form onSubmit={requestOtp} className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#1F2937] tracking-tight">Contact Information</h3>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Enter your mobile or WhatsApp number for <span className="text-[#F97316] font-semibold">deal updates & intelligence</span>.
            </p>
          </div>

          <div className="space-y-4">
            <div className="group relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#F97316] transition-colors">
                <Smartphone size={18} />
              </div>
              <input
                type="tel"
                placeholder="+91 Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white/60 backdrop-blur-sm border-2 border-gray-100 rounded-[20px] px-12 py-5 text-sm font-bold text-[#1F2937] focus:ring-8 focus:ring-[#F97316]/5 focus:bg-white focus:border-[#F97316] focus:shadow-xl focus:shadow-[#F97316]/5 transition-all outline-none placeholder:text-gray-300 shadow-sm"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#1F2937] text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#F97316] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all shadow-xl hover:shadow-[#F97316]/20 disabled:opacity-50 group"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Verify via WhatsApp
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      <div className="pt-6 border-t border-gray-50 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-gray-400">
          <ShieldCheck size={14} className="text-green-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Institutional Privacy Standard</span>
        </div>
        <p className="text-[9px] text-gray-300 font-medium text-center italic">
          Your number is safely encrypted and used exclusively for verified counterparty inquiries.
        </p>
      </div>
    </div>
  );
}
