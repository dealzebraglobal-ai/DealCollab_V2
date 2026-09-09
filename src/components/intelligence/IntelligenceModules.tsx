'use client';
import React from 'react';
import Link from 'next/link';
import { Network, TrendingUp, Target, Compass, BarChart3, Globe, ArrowRight, Lock } from 'lucide-react';

interface IntelligenceModuleItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge: string;
  href: string | null;
  active: boolean;
}

const modules: IntelligenceModuleItem[] = [
  {
    title: "Buyer Intent Intelligence",
    description: "Behavioral analysis of capital allocators to identify high-conviction acquisition interest.",
    icon: Target,
    badge: "Live Engine",
    href: "/deal-intelligence/buyer-intent",
    active: true,
  },
  {
    title: "Network Intelligence",
    description: "Real-time mapping of institutional relationships and decision nodes across the deal ecosystem.",
    icon: Network,
    badge: "Graph Intelligence",
    href: null,
    active: false,
  },
  {
    title: "Deal Flow Prediction",
    description: "Probabilistic modeling of upcoming capital events before they reach the public market.",
    icon: TrendingUp,
    badge: "Predictive AI",
    href: null,
    active: false,
  },
  {
    title: "Undersupplied Demand Zones",
    description: "Gap analysis identifying sectors where capital demand significantly outstrips active deal supply.",
    icon: Compass,
    badge: "Supply Gap",
    href: null,
    active: false,
  },
  {
    title: "Deal Closure Probability",
    description: "Quantitative assessment of transaction success based on historical and situational variables.",
    icon: BarChart3,
    badge: "Scoring Model",
    href: null,
    active: false,
  },
  {
    title: "Cross-Border Capital Flow",
    description: "Tracking international dry powder movement and multi-jurisdiction acquisition corridors.",
    icon: Globe,
    badge: "Global Flow",
    href: null,
    active: false,
  }
];

export default function IntelligenceModules() {
  return (
    <section className="relative z-10 py-10 max-w-6xl mx-auto w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module, index) => {
          const Icon = module.icon;

          if (module.active && module.href) {
            return (
              <Link key={index} href={module.href} className="block group h-full">
                <div className="p-6 bg-white border-2 border-[#FF6A00]/40 hover:border-[#FF6A00] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full relative overflow-hidden ring-1 ring-[#FF6A00]/10">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-[#FFF7ED] border border-[#FFEDD5] flex items-center justify-center text-[#FF6A00] shadow-xs">
                        <Icon size={20} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6A00] bg-[#FFF7ED] border border-[#FFEDD5] px-2.5 py-0.5 rounded-full">
                          {module.badge}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-[#1F1F1F] tracking-tight group-hover:text-[#FF6A00] transition-colors">
                        {module.title}
                      </h3>
                      <p className="text-xs text-[#525252] leading-relaxed font-normal">
                        {module.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-[#FFEDD5] flex items-center justify-between text-xs font-bold text-[#FF6A00]">
                    <span>Explore Intent Telemetry</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            );
          }

          return (
            <div key={index} className="h-full">
              <div className="p-6 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl flex flex-col justify-between h-full opacity-70 hover:opacity-85 transition-opacity select-none">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF]">
                      <Icon size={20} />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] bg-[#F3F4F6] border border-[#E5E7EB] px-2.5 py-0.5 rounded-full">
                      Coming Soon
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-bold text-[#4B5563] tracking-tight">
                      {module.title}
                    </h3>
                    <p className="text-xs text-[#9CA3AF] leading-relaxed font-normal">
                      {module.description}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[#E5E7EB] flex items-center justify-between text-xs font-medium text-[#9CA3AF]">
                  <span className="inline-flex items-center gap-1.5 text-[11px]">
                    <Lock size={12} className="text-[#9CA3AF]" />
                    Under Development
                  </span>
                  <span className="text-[10px] font-mono uppercase text-[#9CA3AF] tracking-wider">
                    {module.badge}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
