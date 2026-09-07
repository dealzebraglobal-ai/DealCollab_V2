'use client';
import React from 'react';
import HeroSection from '@/components/intelligence/HeroSection';
import IntelligenceStrip from '@/components/intelligence/IntelligenceStrip';
import IntelligenceModules from '@/components/intelligence/IntelligenceModules';
import PremiumAccess from '@/components/intelligence/PremiumAccess';
import TrustLayer from '@/components/intelligence/TrustLayer';

export default function DealIntelligencePage() {
  return (
    <div className="relative flex-1 w-full min-h-screen bg-white overflow-x-hidden overflow-y-auto">
      <div className="relative flex flex-col w-full pb-20 max-w-6xl mx-auto px-6 sm:px-10">
        <HeroSection />
        <IntelligenceStrip />
        <IntelligenceModules />
        <PremiumAccess />
        <TrustLayer />
      </div>
    </div>
  );
}
