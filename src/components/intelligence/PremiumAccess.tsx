'use client';
import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function PremiumAccess() {
  return (
    <section className="relative z-10 py-10 max-w-4xl mx-auto w-full">
      <div className="bg-[#F9FAFB] border border-[#E5E7EB] hover:border-black rounded-2xl p-8 sm:p-12 text-center space-y-6 shadow-sm transition-all duration-200">
        <div className="flex flex-col items-center space-y-5">
          <div className="bg-white p-3.5 rounded-full border border-[#E5E7EB] text-[#FF6A00] shadow-sm">
            <ShieldCheck size={30} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1F1F1F] tracking-tight leading-tight">
              Basic users see information. <br />
              <span className="text-[#747775]">Serious players see intelligence.</span>
            </h2>
          </div>
          
          <div className="pt-2">
            <button className="px-7 py-3 bg-[#1F1F1F] hover:bg-black text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95">
              Apply for Access
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
