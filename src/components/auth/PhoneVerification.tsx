'use client';
import React, { useState, useCallback } from 'react';
import { Smartphone, ArrowRight, ShieldCheck, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
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
  const [isSuccess, setIsSuccess] = useState(false);

  const { data: session, update } = useSession();

  const formatPhone = () => {
    const cleaned = phone.replace(/[^\d+]/g, '');
    return cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;
  };

  const completeVerification = useCallback(async (phoneNumber: string) => {
    try {
      setIsLoading(true);
      setError(null);

      if (session) {
        // User logged in — link phone to account directly (no OTP compulsion)
        const saveRes = await fetch('/api/auth/save-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneNumber }),
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
        }, 600);
      } else {
        onVerify();
      }
    } catch (err: unknown) {
      console.error("[PhoneVerification] Completion error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [session, update, onVerify]);

  const handleContinue = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!phone.trim()) {
      onVerify();
      return;
    }

    const formattedPhone = formatPhone();
    const digitsOnly = formattedPhone.replace(/\D/g, '');

    if (digitsOnly.length < 10) {
      setError("Please enter a valid 10-digit phone number, or tap 'Skip for now'.");
      return;
    }

    await completeVerification(formattedPhone);
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
            <h3 className="text-lg font-bold text-green-900">Phone Saved!</h3>
            <p className="text-xs text-green-700 font-medium">Your profile has been updated. Proceeding...</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleContinue} className="space-y-6">
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
                  Save & Continue
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onVerify()}
              disabled={isLoading}
              className="w-full text-center text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors py-2 block"
            >
              Skip for now →
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
