'use client';
import React, { useState, useEffect } from 'react';

interface TokenRewardDisplayProps {
  finalAmount: number;
  duration?: number;
}

export default function TokenRewardDisplay({ finalAmount, duration = 1500 }: TokenRewardDisplayProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * finalAmount));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [finalAmount, duration]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <div className="text-4xl sm:text-5xl font-black text-[#F97316] tracking-tight">
          +{count}
        </div>
        <div className="absolute -inset-2 bg-orange-500/10 blur-xl rounded-full -z-10" />
      </div>
      <div className="text-xs font-black text-gray-900 uppercase tracking-widest mt-1">
        Tokens Credited
      </div>
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
        Onboarding Bonus
      </p>
    </div>
  );
}
