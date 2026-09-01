'use client';
import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, X, Check, Coins, Search, FileText, LayoutDashboard } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  targetSelector?: string;
  icon: React.ElementType;
}

const STEPS: Step[] = [
  {
    id: 'tokens',
    title: '1. Tokens & Intelligence Rewards',
    subtitle: 'Your Currency for Connections',
    description: 'Tokens power direct connections with counterparties. You earn 100 free tokens upon completing your profile, and tokens are only deducted when a counterparty accepts your EOI.',
    icon: Coins,
  },
  {
    id: 'search',
    title: '2. AI Mandate Discovery',
    subtitle: 'Search Across Opportunities',
    description: 'Easily filter by sector, transaction type, or geography. Our Intelligence Layer continually compares your requirements against qualified mandates in real-time.',
    icon: Search,
  },
  {
    id: 'deal-log',
    title: '3. Real-Time Deal Log',
    subtitle: 'Unified Mandate Tracking',
    description: 'View all your active Chat, WhatsApp, and Bulk Uploaded mandates with instant AI compatibility scoring and detailed teaser insights.',
    icon: FileText,
  },
  {
    id: 'deal-dashboard',
    title: '4. Deal & EOI Dashboard',
    subtitle: 'Actionable Counterparty Connections',
    description: 'Manage incoming and outgoing Expressions of Interest (EOIs) within our 3-day approval window to schedule introductions safely.',
    icon: LayoutDashboard,
  },
];

export default function OnboardingTutorial() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check if user has completed tutorial
    const completed = localStorage.getItem('dc_tutorial_completed');
    if (!completed) {
      // Delay slightly for smooth page entrance
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('dc_tutorial_completed', 'true');
    setIsOpen(false);
  };

  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Progress */}
        <div className="p-6 bg-gradient-to-r from-orange-50/70 via-white to-amber-50/50 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-orange-200/80 shadow-sm">
              <Sparkles size={13} className="text-[#F97316]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#F97316]">
                DealCollab Onboarding • Step {currentStep + 1} of {STEPS.length}
              </span>
            </div>

            <button
              onClick={handleComplete}
              className="text-xs font-bold text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
              <span>Skip</span>
              <X size={14} />
            </button>
          </div>

          {/* Step Progress Bar */}
          <div className="grid grid-cols-4 gap-1.5">
            {STEPS.map((s, idx) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx <= currentStep ? 'bg-[#F97316]' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Body */}
        <div className="p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shrink-0 shadow-md shadow-orange-500/10">
              <Icon size={28} />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black text-gray-900 tracking-tight">{step.title}</h2>
              <p className="text-xs font-bold text-[#F97316] uppercase tracking-wider">{step.subtitle}</p>
            </div>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200/70">
            <p className="text-sm text-gray-700 leading-relaxed font-normal">
              {step.description}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={isFirst}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              isFirst
                ? 'opacity-0 pointer-events-none'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white border border-gray-200 cursor-pointer'
            }`}
          >
            <ArrowLeft size={15} />
            Back
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-orange-500/20 active:scale-95 cursor-pointer"
          >
            {isLast ? (
              <>
                Get Started
                <Check size={16} />
              </>
            ) : (
              <>
                Next Step
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
