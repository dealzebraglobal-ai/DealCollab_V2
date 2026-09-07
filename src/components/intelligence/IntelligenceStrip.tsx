'use client';
import React from 'react';

export default function IntelligenceStrip() {
  const signals = [
    "Deal Flow Signals Active",
    "Buyer Intent Rising",
    "Network Activity Increasing",
    "Private Equity Dry Powder +12%",
    "Cross-Border Interest Surging"
  ];

  return (
    <div className="relative z-10 w-full py-4">
      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5 bg-[#F9FAFB] border border-[#E5E7EB] hover:border-black rounded-2xl py-3.5 px-4 sm:px-6 shadow-sm transition-all duration-200">
        {signals.map((signal, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E5E7EB] shadow-xs hover:border-black transition-all duration-200"
          >
            <span className="w-1.5 h-1.5 bg-[#16A34A] rounded-full shrink-0 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#1F1F1F] whitespace-nowrap">
              {signal}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
