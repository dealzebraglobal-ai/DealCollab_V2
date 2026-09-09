'use client';
import React from 'react';
import Link from 'next/link';
import { Network, TrendingUp, Target, Compass, BarChart3, Globe, ArrowRight } from 'lucide-react';

const modules = [
  {
    title: "Network Intelligence",
    description: "Real-time mapping of institutional relationships and decision nodes across the deal ecosystem.",
    icon: Network,
    badge: "Live Graph",
    href: null,
  },
  {
    title: "Deal Flow Prediction",
    description: "Probabilistic modeling of upcoming capital events before they reach the public market.",
    icon: TrendingUp,
    badge: "Predictive",
    href: null,
  },
  {
    title: "Buyer Intent Intelligence",
    description: "Behavioral analysis of capital allocators to identify high-conviction acquisition interest.",
    icon: Target,
    badge: "Live Engine",
    href: "/deal-intelligence/buyer-intent",
  },
  {
    title: "Undersupplied Demand Zones",
    description: "Gap analysis identifying sectors where capital demand significantly outstrips active deal supply.",
    icon: Compass,
    badge: "Supply Gap",
    href: null,
  },
  {
    title: "Deal Closure Probability",
    description: "Quantitative assessment of transaction success based on historical and situational variables.",
    icon: BarChart3,
    badge: "Scoring",
    href: null,
  },
  {
    title: "Cross-Border Capital Flow",
    description: "Tracking international dry powder movement and multi-jurisdiction acquisition corridors.",
    icon: Globe,
    badge: "Global Flow",
    href: null,
  }
];

export default function IntelligenceModules() {
  return (
    <section className="relative z-10 py-10 max-w-6xl mx-auto w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module, index) => {
          const Icon = module.icon;
          const CardContent = (
            <div className="p-6 bg-white border border-[#E5E7EB] hover:border-black rounded-2xl shadow-sm transition-all duration-200 flex flex-col justify-between h-full group">
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
                  <h3 className="text-base font-bold text-[#1F1F1F] tracking-tight group-hover:text-[#FF6A00] transition-colors">
                    {module.title}
                  </h3>
                  <p className="text-xs text-[#747775] leading-relaxed font-normal">
                    {module.description}
                  </p>
                </div>
              </div>

              {module.href && (
                <div className="mt-4 pt-3 border-t border-[#E5E7EB] flex items-center justify-between text-xs font-bold text-[#FF6A00]">
                  <span>{module.title === "Buyer Intent Intelligence" ? "Explore Intent" : "Explore Module"}</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </div>
          );

          if (module.href) {
            return (
              <Link key={index} href={module.href} className="block">
                {CardContent}
              </Link>
            );
          }

          return (
            <div key={index}>
              {CardContent}
            </div>
          );
        })}
      </div>
    </section>
  );
}
