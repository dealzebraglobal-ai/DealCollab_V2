'use client';
import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, ArrowRight, ShieldCheck, Sparkles, Coins, Flame } from 'lucide-react';
import TokenRewardDisplay from './TokenRewardDisplay';
import ConfettiCelebrationBackground from './ConfettiCelebrationBackground';
import confetti from 'canvas-confetti';

interface ProfileSuccessScreenProps {
  onDashboardClick: () => void;
  returnUrl?: string | null;
}

export default function ProfileSuccessScreen({ onDashboardClick, returnUrl }: ProfileSuccessScreenProps) {
  const [countdown, setCountdown] = useState(5);
  const callbackRef = useRef(onDashboardClick);
  callbackRef.current = onDashboardClick;

  useEffect(() => {
    // Initial celebratory pop sequence
    const colors = ['#F59E0B', '#FBBF24', '#8B5CF6', '#7C3AED', '#EF4444', '#F43F5E', '#0EA5E9', '#10B981'];
    const defaults = {
      spread: 360,
      ticks: 100,
      gravity: 0.9,
      decay: 0.92,
      startVelocity: 45,
      colors,
      zIndex: 999999
    };

    const fireSafely = (opts: confetti.Options) => {
      try {
        if (typeof confetti === 'function') {
          confetti({ ...defaults, ...opts });
        }
      } catch (err) {
        console.warn('[ProfileSuccessScreen] Confetti error:', err);
      }
    };

    // Initial celebratory blast
    fireSafely({ particleCount: 50, spread: 90, startVelocity: 45, origin: { x: 0.5, y: 0.35 } });
    fireSafely({ particleCount: 40, angle: 60, spread: 70, startVelocity: 50, origin: { x: 0.1, y: 0.85 } });
    fireSafely({ particleCount: 40, angle: 120, spread: 70, startVelocity: 50, origin: { x: 0.9, y: 0.85 } });

    // Visual countdown interval (5s countdown)
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // Auto-redirect timeout after 5 seconds
    const redirectTimeout = setTimeout(() => {
      callbackRef.current?.();
    }, 5000);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(redirectTimeout);
    };
  }, []);

  const buttonLabel = returnUrl ? 'Continue to Deal / Send EOI' : 'Go to EOI Activities';

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-[#070E1A]/85 backdrop-blur-xl overflow-y-auto animate-in fade-in duration-500">

      {/* 1. SOFT AMBIENT GLOW AURAS */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-amber-500/15 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-10 left-1/4 w-[450px] h-[450px] bg-purple-500/15 rounded-full blur-[140px]" />
        <div className="absolute top-10 right-1/4 w-[450px] h-[450px] bg-sky-500/15 rounded-full blur-[140px]" />
      </div>

      {/* 2. CONTINUOUS CELEBRATORY CONFETTI ANIMATION (LOTTIEFILES STYLE) */}
      <ConfettiCelebrationBackground />

      {/* 3. MAIN CONGRATULATIONS MODAL CARD */}
      <div className="max-w-md w-full text-center space-y-4 animate-in zoom-in-95 duration-500 relative z-10 my-auto">
        <div className="bg-white rounded-3xl border border-white/20 p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.5)] relative overflow-hidden backdrop-blur-2xl">
          {/* Top Rainbow Accent Strip */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-[#F97316] via-purple-500 to-sky-500" />

          <div className="space-y-4">
            {/* Header Badge & Animated Icon */}
            <div className="flex justify-center flex-col items-center gap-2.5">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-tr from-emerald-500 via-green-500 to-emerald-400 rounded-full flex items-center justify-center text-white shadow-xl shadow-green-500/30 border-3 border-white animate-bounce duration-1000">
                  <CheckCircle2 size={30} strokeWidth={2.5} />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-amber-400 text-amber-950 p-1 rounded-full shadow-md border-2 border-white animate-pulse">
                  <Coins size={13} strokeWidth={3} />
                </div>
              </div>

              <div className="space-y-1.5 max-w-sm mx-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-amber-50 border border-amber-200/80 rounded-full text-amber-900 text-[10px] font-black uppercase tracking-wider shadow-xs">
                  <Sparkles size={12} className="text-[#F97316] animate-spin" style={{ animationDuration: '4s' }} />
                  Profile Verified & Activated
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-snug">
                  🎉 Congratulations!
                </h1>

                <div className="flex items-center justify-center gap-1 text-xs sm:text-sm font-black text-[#F97316]">
                  <Flame size={16} className="fill-[#F97316]" />
                  <span>You’ve earned 100 Free Tokens!</span>
                </div>

                <p className="text-gray-500 text-xs font-medium leading-relaxed">
                  Your profile is fully verified. You can now immediately send Expressions of Interest to verified counterparties.
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-gray-100" />

            {/* Token Reward Display (+100 Counter) */}
            <div>
              <TokenRewardDisplay finalAmount={100} duration={1200} />
            </div>

            {/* Pro Tip Card */}
            <div className="bg-orange-50/90 border border-orange-200/70 rounded-xl p-3 flex items-start gap-2.5 text-left max-w-sm mx-auto shadow-xs">
              <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-[#F97316] shadow-xs shrink-0 border border-orange-100">
                <ShieldCheck size={15} />
              </div>
              <p className="text-[11px] font-medium text-orange-950 leading-snug">
                <span className="font-bold text-[#F97316]">Pro Tip:</span> Tokens are only deducted when a counterparty accepts your connection request.
              </p>
            </div>
          </div>
        </div>

        {/* 4. ACTION BUTTON & COUNTDOWN */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onDashboardClick}
            className="bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:brightness-110 active:scale-95 text-white px-8 py-3 rounded-xl font-black text-sm transition-all flex items-center gap-2.5 mx-auto shadow-xl shadow-orange-500/30 cursor-pointer transform hover:-translate-y-0.5 border border-orange-400/30"
          >
            <span>{buttonLabel}</span>
            <ArrowRight size={17} className="animate-in slide-in-from-left-4 duration-500" />
          </button>

          <p className="text-[11px] text-gray-300 font-medium bg-black/40 px-3 py-0.5 rounded-full border border-white/10">
            Redirecting automatically in <span className="font-bold text-amber-400">{countdown}s</span>...
          </p>
        </div>
      </div>
    </div>
  );
}
