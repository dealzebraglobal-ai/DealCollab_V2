'use client';
import React, { useState } from 'react';
import { Mail, Send, ArrowLeft, AlertCircle } from 'lucide-react';
import { isValidEmail } from '@/lib/validation/profile';

interface EmailVerificationProps {
  onSent: (email: string) => void;
  onBack: () => void;
  initialEmail?: string;
}

export default function EmailVerification({ onSent, onBack, initialEmail }: EmailVerificationProps) {
  const [email, setEmail] = useState(initialEmail || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/email-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        onSent(trimmedEmail);
      } else {
        setError(data.error || 'Failed to send verification code');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    }
    setIsLoading(false);
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
          Email Sign In
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-[#1F2937] tracking-tight">Email Address</h3>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">
            We&apos;ll send a <span className="text-[#F97316]">verification code</span> to sign you in.
          </p>
        </div>

        <div className="group relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#F97316] transition-colors">
            <Mail size={18} />
          </div>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            aria-label="Email address"
            className="w-full bg-white/60 backdrop-blur-sm border-2 border-gray-100 rounded-[20px] px-12 py-5 text-sm font-bold text-[#1F2937] focus:ring-8 focus:ring-[#F97316]/5 focus:bg-white focus:border-[#F97316] focus:shadow-xl focus:shadow-[#F97316]/5 transition-all outline-none placeholder:text-gray-300 shadow-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !email}
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
      </form>
    </div>
  );
}
