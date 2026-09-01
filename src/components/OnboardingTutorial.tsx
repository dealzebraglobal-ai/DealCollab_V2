'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, X, Check, Coins, Search, FileText, LayoutDashboard } from 'lucide-react';
import { useUser } from './UserProvider';

export interface OnboardingStep {
  id: string;
  targetKey: string;
  title: string;
  badge: string;
  description: string;
  preferredPlacement: 'bottom' | 'top' | 'right' | 'left';
  icon: React.ElementType;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'tokens',
    targetKey: 'tokens',
    title: 'Tokens',
    badge: '1 of 4',
    description: 'Tokens are used across DealCollab to access and use platform features. You can earn Tokens through eligible activities (such as completing your profile) and use them where Tokens are required, such as sending Expressions of Interest.',
    preferredPlacement: 'bottom',
    icon: Coins,
  },
  {
    id: 'search',
    targetKey: 'search',
    title: 'Search Bar',
    badge: '2 of 4',
    description: 'Use Search to find relevant deals, mandates, and counterparties across the platform.',
    preferredPlacement: 'bottom',
    icon: Search,
  },
  {
    id: 'deal-log',
    targetKey: 'deal-log',
    title: 'Deal Log',
    badge: '3 of 4',
    description: 'Deal Log is where you can see your deals, conversations, and matched opportunities.',
    preferredPlacement: 'right',
    icon: FileText,
  },
  {
    id: 'deal-dashboard',
    targetKey: 'deal-dashboard',
    title: 'Deal Dashboard',
    badge: '4 of 4',
    description: 'Deal Dashboard helps you track and manage your overall deal activity.',
    preferredPlacement: 'right',
    icon: LayoutDashboard,
  },
];

interface Position {
  top: number;
  left: number;
  placement: 'bottom' | 'top' | 'right' | 'left' | 'center';
  targetRect?: DOMRect;
}

export default function OnboardingTutorial() {
  const { profile, onboarding, completeOnboardingTutorial, isAuthenticated } = useUser();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, placement: 'center' });
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // STRICT RULE: Only show for NEW USER + INCOMPLETE PROFILE
  // If profileCompleted === true, NEVER show tutorial under any circumstances
  const shouldShowTutorial = useCallback(() => {
    if (!isAuthenticated) return false;
    if (!profile) return false;

    // Rule: Completed profile strictly takes precedence over onboarding
    const isProfileComplete = !!(
      profile.profileCompleted ||
      profile.profileCompletedOnce ||
      (profile.profileCompletion ?? 0) >= 100 ||
      onboarding.profileCompleted
    );
    if (isProfileComplete) return false;

    // Rule: Already completed or skipped tutorial
    if (profile.onboardingTutorialCompleted || onboarding.tutorialCompleted) return false;
    if (typeof window !== 'undefined' && localStorage.getItem('dc_tutorial_completed') === 'true') {
      return false;
    }

    return true;
  }, [isAuthenticated, profile, onboarding]);

  useEffect(() => {
    if (shouldShowTutorial()) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 600);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [shouldShowTutorial]);

  const step = ONBOARDING_STEPS[currentStepIndex];

  // Dynamic positioning calculation relative to target element
  const updatePosition = useCallback(() => {
    if (!step) return;

    const targetEl = document.querySelector(`[data-onboarding-target="${step.targetKey}"]`);
    if (!targetEl || !cardRef.current) {
      // Safe fallback if target element not available in current viewport/DOM
      setPosition({
        top: window.innerHeight / 2 - 140,
        left: Math.max(16, window.innerWidth / 2 - 180),
        placement: 'center',
      });
      return;
    }

    const targetRect = targetEl.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    const cardWidth = cardRect.width || 360;
    const cardHeight = cardRect.height || 260;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    const gap = 14;

    let top = 0;
    let left = 0;
    let placement = step.preferredPlacement;

    // Determine optimal placement based on available viewport space
    if (placement === 'right' && targetRect.right + cardWidth + gap + padding > viewportWidth) {
      placement = targetRect.bottom + cardHeight + gap + padding <= viewportHeight ? 'bottom' : 'top';
    } else if (placement === 'bottom' && targetRect.bottom + cardHeight + gap + padding > viewportHeight) {
      placement = 'top';
    } else if (placement === 'top' && targetRect.top - cardHeight - gap - padding < 0) {
      placement = 'bottom';
    }

    switch (placement) {
      case 'bottom':
        top = targetRect.bottom + gap;
        left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
        break;
      case 'top':
        top = targetRect.top - cardHeight - gap;
        left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
        left = targetRect.right + gap;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
        left = targetRect.left - cardWidth - gap;
        break;
      default:
        top = window.innerHeight / 2 - cardHeight / 2;
        left = window.innerWidth / 2 - cardWidth / 2;
    }

    // Viewport boundary clamping
    left = Math.max(padding, Math.min(left, viewportWidth - cardWidth - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - cardHeight - padding));

    setPosition({ top, left, placement, targetRect });
  }, [step]);

  useEffect(() => {
    if (!isVisible) return;

    updatePosition();
    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isVisible, currentStepIndex, updatePosition]);

  // Keyboard accessibility (Escape to skip, Enter/Space for controls)
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  if (!isVisible || !step) return null;

  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === ONBOARDING_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleFinish = async () => {
    setIsVisible(false);
    await completeOnboardingTutorial();
  };

  const handleSkip = async () => {
    setIsVisible(false);
    await completeOnboardingTutorial();
  };

  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Target Spotlight Highlight Ring */}
      {position.targetRect && (
        <div
          style={{
            top: position.targetRect.top - 4,
            left: position.targetRect.left - 4,
            width: position.targetRect.width + 8,
            height: position.targetRect.height + 8,
          }}
          className="fixed rounded-2xl ring-4 ring-[#F97316]/60 shadow-[0_0_25px_rgba(249,115,22,0.4)] pointer-events-none transition-all duration-300 z-[10000] animate-pulse"
        />
      )}

      {/* Dimmed Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-auto transition-opacity duration-300"
        onClick={handleSkip}
      />

      {/* Onboarding Cloud/Square Card with Arrow */}
      <div
        ref={cardRef}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        className="fixed pointer-events-auto w-[90vw] sm:w-[380px] max-w-[380px] bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 z-[10001] transition-all duration-300 animate-in zoom-in-95"
      >
        {/* Arrow Pointer */}
        {position.placement === 'bottom' && (
          <div className="absolute -top-2 left-8 w-4 h-4 bg-white border-t border-l border-gray-100 rotate-45" />
        )}
        {position.placement === 'top' && (
          <div className="absolute -bottom-2 left-8 w-4 h-4 bg-white border-b border-r border-gray-100 rotate-45" />
        )}
        {position.placement === 'right' && (
          <div className="absolute top-8 -left-2 w-4 h-4 bg-white border-b border-l border-gray-100 rotate-45" />
        )}
        {position.placement === 'left' && (
          <div className="absolute top-8 -right-2 w-4 h-4 bg-white border-t border-r border-gray-100 rotate-45" />
        )}

        {/* Card Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316]">
              <Icon size={16} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#F97316] bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">
              {step.badge}
            </span>
          </div>

          <button
            onClick={handleSkip}
            className="text-xs font-bold text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <span>Skip Tutorial</span>
            <X size={14} />
          </button>
        </div>

        {/* Card Title & Content */}
        <div className="space-y-2 mb-6">
          <h3 className="text-base font-black text-gray-900 tracking-tight">
            {step.title}
          </h3>
          <p className="text-xs text-gray-600 leading-relaxed font-medium">
            {step.description}
          </p>
        </div>

        {/* Step Progress Dots & Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            {ONBOARDING_STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStepIndex
                    ? 'w-6 bg-[#F97316]'
                    : idx < currentStepIndex
                      ? 'w-1.5 bg-orange-300'
                      : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handleBack}
                className="px-3 py-2 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft size={13} />
                Back
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              {isLast ? (
                <>
                  Finish
                  <Check size={14} />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
