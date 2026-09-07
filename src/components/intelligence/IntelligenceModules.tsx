'use client';
import React from 'react';
import { Network, TrendingUp, Target, Compass, BarChart3, Globe } from 'lucide-react';

const modules = [
  {
    title: "Network Intelligence",
    description: "Real-time mapping of institutional relationships and decision nodes across the deal ecosystem.",
    icon: Network,
    badge: "Live Graph",
  },
  {
    title: "Deal Flow Prediction",
    description: "Probabilistic modeling of upcoming capital events before they reach the public market.",
    icon: TrendingUp,
    badge: "Predictive",
  },
  {
    title: "Buyer Intent Intelligence",
    description: "Behavioral analysis of capital allocators to identify high-conviction acquisition interest.",
    icon: Target,
    badge: "Intent Engine",
  },
  {
    title: "Undersupplied Demand Zones",
    description: "Gap analysis identifying sectors where capital demand significantly outstrips active deal supply.",
    icon: Compass,
    badge: "Supply Gap",
  },
  {
    title: "Deal Closure Probability",
    description: "Quantitative assessment of transaction success based on historical and situational variables.",
    icon: BarChart3,
    badge: "Scoring",
  },
  {
    title: "Cross-Border Capital Flow",
    description: "Tracking international dry powder movement and multi-jurisdiction acquisition corridors.",
    icon: Globe,
    badge: "Global Flow",
  }
];

export default function IntelligenceModules() {
  return (
    <section className="relative z-10 py-10 max-w-6xl mx-auto w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module, index) => {
          const Icon = module.icon;
          return (
            <div 
              key={index}
              className="group relative p-6 bg-white border border-[#E5E7EB] hover:border-black rounded-2xl shadow-sm transition-all duration-200 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#FFF7ED] border border-[#FFEDD5] flex items-center justify-center text-[#FF6A00]">
                    <Icon size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6A00] bg-[#FFF7ED] border border-[#FFEDD5] px-2.5 py-0.5 rounded-full">
                    {module.badge}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-[#1F1F1F] tracking-tight">
                    {module.title}
                  </h3>
                  <p className="text-xs text-[#747775] leading-relaxed font-normal">
                    {module.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
