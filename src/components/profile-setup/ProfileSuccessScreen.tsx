'use client';
import React, { useEffect, useState } from 'react';
import { CheckCircle2, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import TokenRewardDisplay from './TokenRewardDisplay';
import confetti from 'canvas-confetti';

interface ProfileSuccessScreenProps {
  onDashboardClick: () => void;
  returnUrl?: string | null;
}

export default function ProfileSuccessScreen({ onDashboardClick, returnUrl }: ProfileSuccessScreenProps) {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    // Premium celebration blast
    const duration = 4 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    // Countdown for auto-redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDashboardClick();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [onDashboardClick]);

  const buttonLabel = returnUrl ? 'Continue to Deal / Send EOI' : 'Go to Deal Dashboard';

  return (
    <div className="min-h-screen w-full bg-brand-card flex items-center justify-center p-6 py-20 animate-in fade-in duration-700 relative overflow-y-auto">
      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-accent/5 rounded-full -mr-96 -mt-96 blur-[120px] opacity-40" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full -ml-72 -mb-72 blur-[120px] opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-brand-accent/20 rounded-full animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-blue-400/10 rounded-full animate-bounce" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/3 left-1/2 w-2 h-2 bg-green-400/10 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-2xl w-full text-center space-y-10 animate-in scale-in-premium duration-1000 fill-mode-both">
        {/* SUCCESS CARD */}
        <div className="bg-white rounded-[48px] border border-brand-border p-10 sm:p-14 shadow-[0_32px_80px_rgba(31,41,55,0.08)] relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-2 bg-gradient-to-r from-amber-400 via-[#F97316] to-emerald-500" />
          
          <div className="space-y-8">
            <div className="flex justify-center flex-col items-center gap-5">
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 shadow-xl shadow-green-500/10 border-4 border-white animate-bounce duration-1000">
                <CheckCircle2 size={44} strokeWidth={2} />
              </div>
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-800 text-xs font-black uppercase tracking-wider">
                  <Sparkles size={14} className="text-[#F97316]" /> Profile Verified & Activated
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight leading-snug">
                  🎉 Congratulations! You’ve completed your profile and earned 100 Tokens!
                </h2>
                <p className="text-brand-secondary text-base font-medium">
                  Your profile is now verified. You can immediately send Expressions of Interest to counterparties.
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-gray-100" />

            <TokenRewardDisplay finalAmount={100} />

            <div className="bg-orange-50/60 border border-orange-100 rounded-[20px] p-4 flex items-start gap-3.5 text-left max-w-md mx-auto">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-brand-accent shadow-sm shrink-0">
                <ShieldCheck size={18} />
              </div>
              <p className="text-xs font-medium text-orange-900 leading-normal">
                <span className="font-bold">Pro Tip:</span> Tokens are only deducted when a counterparty accepts your connection request.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button 
            onClick={onDashboardClick}
            className="bg-[#1F2937] hover:bg-[#F97316] text-white px-10 py-4.5 rounded-2xl font-black text-base transition-all flex items-center gap-3 mx-auto shadow-xl shadow-gray-900/10 transform hover:-translate-y-1 active:scale-95 cursor-pointer"
          >
            {buttonLabel}
            <ArrowRight size={20} className="animate-in slide-in-from-left-4 duration-500" />
          </button>
          <p className="text-xs text-gray-400 font-medium">
            Redirecting automatically in <span className="font-bold text-gray-700">{countdown}s</span>...
          </p>
        </div>
      </div>
    </div>
  );
}
