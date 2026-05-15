'use client';
import React from 'react';
import HeroSection from '@/components/intelligence/HeroSection';
import IntelligenceStrip from '@/components/intelligence/IntelligenceStrip';
import IntelligenceModules from '@/components/intelligence/IntelligenceModules';
import PremiumAccess from '@/components/intelligence/PremiumAccess';
import TrustLayer from '@/components/intelligence/TrustLayer';
import IntelligenceVideoBackground from '@/components/intelligence/IntelligenceVideoBackground';

import FeatureLockedOverlay from '@/components/FeatureLockedOverlay';

export default function DealIntelligencePage() {
  const isLocked = false; // Feature lock enabled

  return (
    <div className={`relative flex-1 w-full min-h-screen bg-[#0B0F1A] transition-all duration-700 ${isLocked ? 'h-screen overflow-hidden pointer-events-none' : 'overflow-x-hidden overflow-y-auto scrollbar-hide'}`}>
      {isLocked && <FeatureLockedOverlay />}
      {/* Background layer */}
      <IntelligenceVideoBackground />
      
      {/* Content orchestration */}
      <div className={`relative flex flex-col w-full pb-20 transition-all duration-700 ${isLocked ? 'blur-md pointer-events-none' : ''}`}>
        <HeroSection />
        <div className="-mt-20">
          <IntelligenceStrip />
        </div>
        <div className="-mt-16">
          <IntelligenceModules />
        </div>
        <PremiumAccess />
        <TrustLayer />
      </div>

      {/* Decorative side vignetting for that "room" feel */}
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black/50 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-black/50 to-transparent pointer-events-none z-10" />
    </div>
  );
}
