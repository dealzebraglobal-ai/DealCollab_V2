'use client';
import React from 'react';

export default function TrustLayer() {
  return (
    <section className="relative z-10 py-12 border-t border-[#E5E7EB] w-full">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
        <div className="space-y-1 max-w-sm">
          <p className="text-[#FF6A00] text-xs font-bold uppercase tracking-wider">Foundation</p>
          <p className="text-[#1F1F1F] font-bold text-base leading-snug">
            Built for institutional-grade decision environments
          </p>
        </div>
        
        <div className="hidden md:block w-[1px] h-10 bg-[#E5E7EB]" />
        
        <div className="space-y-1 max-w-sm">
          <p className="text-[#FF6A00] text-xs font-bold uppercase tracking-wider">Performance</p>
          <p className="text-[#1F1F1F] font-bold text-base leading-snug">
            Used where timing defines outcomes
          </p>
        </div>

        <div className="hidden md:block w-[1px] h-10 bg-[#E5E7EB]" />
        
        <div className="space-y-1 max-w-sm">
          <p className="text-[#FF6A00] text-xs font-bold uppercase tracking-wider">Integrity</p>
          <p className="text-[#1F1F1F] font-bold text-base leading-snug">
            Exclusive intelligence layer for senior operators
          </p>
        </div>
      </div>
      
      <div className="pt-12 text-center">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#747775]">
          DealCollab AI &copy; 2026 Sovereign Data Intelligence
        </p>
      </div>
    </section>
  );
}
