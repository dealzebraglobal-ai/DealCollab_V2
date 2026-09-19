'use client';

import React from 'react';
import { Sparkles, Heart, Coffee, ArrowRight, X } from 'lucide-react';

interface EOIContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue?: () => void;
}

export default function EOIContributionModal({
  isOpen,
  onClose,
  onContinue,
}: EOIContributionModalProps) {
  if (!isOpen) return null;

  const coffeeUrl = process.env.NEXT_PUBLIC_COFFEE_URL || '';

  const handleCoffeeClick = () => {
    if (coffeeUrl && coffeeUrl.trim().length > 0) {
      window.open(coffeeUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Fallback gracefully without directing users to fake URLs
      window.location.href = '/profile/billing';
    }
  };

  const handleDismiss = () => {
    if (onContinue) {
      onContinue();
    } else {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eoi-contribution-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[#0E1114] text-white rounded-3xl p-7 sm:p-9 max-w-md w-full shadow-2xl border border-white/10 relative overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Subtle Ambient Orange Glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#FFA100]/15 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />

        {/* Close Icon in corner */}
        <button
          onClick={handleDismiss}
          className="absolute top-5 right-5 text-white/40 hover:text-white/80 transition-colors p-1.5 rounded-full hover:bg-white/5"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header with Success Badge */}
        <div className="space-y-4 text-center">
          <div className="w-14 h-14 bg-[#FFA100]/10 border border-[#FFA100]/30 rounded-2xl flex items-center justify-center mx-auto text-[#FFA100] shadow-sm">
            <Sparkles size={24} className="text-[#FFA100]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/25 rounded-full text-emerald-400 text-[11px] font-bold tracking-wide uppercase">
            <span>●</span> Introduction sent successfully
          </div>

          <h3
            id="eoi-contribution-title"
            className="text-lg sm:text-xl font-serif text-white tracking-tight leading-snug pt-1"
            style={{ fontFamily: 'var(--font-serif-card, Georgia, serif)' }}
          >
            We hope this introduction leads to something meaningful.{' '}
            <span className="inline-block text-rose-500 align-middle">
              <Heart size={16} fill="#F43F5E" className="inline" />
            </span>
          </h3>
        </div>

        {/* Message Body */}
        <div className="mt-5 space-y-4 text-center text-xs sm:text-sm text-white/75 font-sans leading-relaxed">
          <p className="font-medium text-white/90">
            Maybe a conversation.
            <br />
            Maybe a collaboration.
            <br />
            Maybe a deal.
          </p>
          <p className="text-white/65 text-xs">
            If you believe in what we’re building, help us keep it alive.
          </p>
          <p className="text-white/85 text-xs font-medium">
            Your small contribution helps us keep DealCollab free for the community.
          </p>
        </div>

        {/* Primary CTA: ☕ Buy Us a Coffee */}
        <div className="mt-7 space-y-3">
          <button
            onClick={handleCoffeeClick}
            data-testid="buy-us-a-coffee-btn"
            className="w-full py-3.5 px-5 bg-gradient-to-r from-[#FFA100] to-[#FF6A00] hover:from-[#FFB326] hover:to-[#FF7A1A] text-black font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Coffee size={16} className="text-black" />
            <span>☕ Buy Us a Coffee</span>
          </button>

          {/* Secondary Dismiss */}
          <button
            onClick={handleDismiss}
            data-testid="eoi-continue-btn"
            className="w-full py-2.5 px-4 text-white/50 hover:text-white/90 text-xs font-semibold tracking-wider transition-colors flex items-center justify-center gap-1.5 hover:bg-white/5 rounded-lg"
          >
            <span>Continue to Dashboard</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Tagline Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 text-center">
          <p
            className="text-[10px] text-white/40 tracking-wider uppercase font-mono"
            style={{ fontFamily: 'var(--font-mono-card, monospace)' }}
          >
            DealCollab · Connecting People, Possibilities and Deals
          </p>
        </div>
      </div>
    </div>
  );
}
