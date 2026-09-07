'use client';
import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function HeroSection() {
  return (
    <section className="relative z-10 pt-12 pb-6 flex flex-col items-center text-center max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 px-3 py-1 bg-[#FFF7ED] border border-[#FFEDD5] rounded-full">
        <Sparkles size={14} className="text-[#FF6A00]" />
        <span className="text-[10px] font-bold text-[#EA580C] uppercase tracking-wider">Market Intelligence Layer</span>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl sm:text-5xl font-bold text-[#1F1F1F] tracking-tight leading-tight">
          Know the Market <br /> Before the Market Knows It
        </h1>
        <p className="text-base sm:text-lg text-[#747775] font-normal max-w-2xl mx-auto leading-relaxed">
          Private intelligence for those who operate ahead of the deal cycle
        </p>
      </div>

      <div className="pt-2">
        <button className="group flex items-center gap-2.5 px-7 py-3.5 bg-[#FF6A00] hover:bg-[#EA580C] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm hover:shadow-md active:scale-95">
          Request Access to Intelligence Layer
          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </section>
  );
}
