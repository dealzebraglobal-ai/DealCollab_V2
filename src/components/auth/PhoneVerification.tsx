'use client';
import React, { useState, useCallback } from 'react';
import { Smartphone, Send, ShieldCheck, ArrowLeft, AlertCircle, RefreshCw, MessageSquare, CheckCircle2 } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface PhoneVerificationProps {
  onVerify: () => void;
  onBack: () => void;
  initialPhone?: string | null;
  isFromWhatsApp?: boolean;
}

export default function PhoneVerification({ onVerify, onBack, initialPhone }: PhoneVerificationProps) {
  const [phone, setPhone] = useState(initialPhone || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const { data: session, update } = useSession();

  const formatPhone = () => {
    const cleaned = phone.replace(/[^\d+]/g, '');
    return cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;
  };

  const completeVerification = useCallback(async (verifiedPhone: string, verificationToken?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      if (session) {
        // User logged in with Google — link phone to account
        const saveRes = await fetch('/api/auth/save-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: verifiedPhone,
            verificationToken: verificationToken || '',
          }),
        });
        const saveData = await saveRes.json();
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

        setIsSuccess(true);
        setTimeout(() => {
          onVerify();
        }, 800);
      } else {
        // User logging in via phone credentials
        const { signIn } = await import('next-auth/react');
        const result = await signIn('credentials', {
          phone: verifiedPhone,
          verificationToken: verificationToken || '',
          redirect: false,
        });

        if (result?.error) {
          setError("Login failed. Please try again.");
        } else {
          setIsSuccess(true);
          setTimeout(() => {
            onVerify();
          }, 800);
        }
      }
    } catch (err: unknown) {
      console.error("[PhoneVerification] Completion error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [session, update, onVerify]);

  // Send OTP to user's phone via WhatsApp
  const handleSendOtp = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formattedPhone = formatPhone();
    const digitsOnly = formattedPhone.replace(/\D/g, '');

    if (digitsOnly.length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      setIsLoading(false);
      return;
    }

    try {
      const sendRes = await fetch('/api/auth/whatsapp-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone }),
      });
      const sendData = await sendRes.json();

      if (!sendRes.ok) {
        setError(sendData.error || "Failed to deliver WhatsApp verification code.");
        setIsLoading(false);
        return;
      }

      setCodeSent(true);
    } catch (err: unknown) {
      console.error("[PhoneVerification] Send error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected network error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Verify the 6-digit code entered by user
  const handleVerifyCode = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formattedPhone = formatPhone();

    try {
      const verifyRes = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, code }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData.error || "Incorrect verification code. Please check and retry.");
        setIsLoading(false);
        return;
      }

      await completeVerification(formattedPhone, verifyData.verificationToken);
    } catch (err: unknown) {
      console.error("[PhoneVerification] Manual verify error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected verification error occurred";
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-700">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <button 
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-all active:scale-90 text-gray-400 group"
        >
          <ArrowLeft size={18} className="group-hover:text-[#F97316] transition-colors" />
        </button>
        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
          Identity Trust Layer
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
              {error.includes('window closed') && (
                <a
                  href="https://wa.me/919373036910?text=Hi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 underline mt-1"
                >
                  <MessageSquare size={13} />
                  Tap here to send &quot;Hi&quot; to +91 9373036910 first, then retry
                </a>
              )}
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
            <p className="text-xs text-green-700 font-medium">Your identity has been confirmed. Proceeding...</p>
          </div>
        </div>
      ) : codeSent ? (
        /* Step 2: Enter Verification Code */
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#1F2937] tracking-tight">Enter Verification Code</h3>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              We sent a 6-digit verification code to <span className="text-[#F97316] font-bold">{formatPhone()}</span> on WhatsApp.
            </p>
          </div>

          <div className="group relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#F97316] transition-colors">
              <ShieldCheck size={18} />
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-white/60 backdrop-blur-sm border-2 border-gray-100 rounded-[20px] px-12 py-5 text-sm font-bold text-[#1F2937] focus:ring-8 focus:ring-[#F97316]/5 focus:bg-white focus:border-[#F97316] focus:shadow-xl focus:shadow-[#F97316]/5 transition-all outline-none placeholder:text-gray-300 shadow-sm"
              autoFocus
              required
            />
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={isLoading || code.length !== 6}
              className="w-full bg-[#1F2937] text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#F97316] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all shadow-xl hover:shadow-[#F97316]/20 disabled:opacity-50 group"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Verify & Continue
                  <Send size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs pt-1 px-1">
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={isLoading}
                className="font-bold text-[#F97316] hover:text-[#EA580C] transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                Resend code
              </button>

              <button
                type="button"
                onClick={() => { setCodeSent(false); setCode(''); setError(null); }}
                disabled={isLoading}
                className="font-bold text-gray-400 hover:text-gray-600 transition-colors"
              >
                Change number
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Step 1: Contact Information */
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#1F2937] tracking-tight">Contact Information</h3>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Please provide your primary WhatsApp number for <span className="text-[#F97316]">Deal Intelligence</span> delivery. We&apos;ll send a 6-digit verification code via WhatsApp to confirm ownership.
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
              type="button"
              onClick={handleSendOtp}
              disabled={isLoading || !phone.trim()}
              className="w-full bg-[#1F2937] text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#F97316] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all shadow-xl hover:shadow-[#F97316]/20 disabled:opacity-50 group"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Send Verification Code
                  <Send size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setCodeSent(true); setError(null); }}
              className="w-full text-center text-xs font-medium text-gray-400 hover:text-[#F97316] transition-colors py-1 block"
            >
              Already have a verification code? Enter it here
            </button>
          </div>
        </div>
      )}

      <div className="pt-6 border-t border-gray-50 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-gray-400">
          <ShieldCheck size={14} className="text-green-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Institutional Privacy Standard</span>
        </div>
        <p className="text-[9px] text-gray-300 font-medium text-center italic">
          Your number is safely encrypted and used exclusively for your deal log.
        </p>
      </div>
    </div>
  );
}
