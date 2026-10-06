'use client';
import React from 'react';

interface MatchCardProps {
  entity: string;
  description: string;
}

export default function MatchCard({ entity, description }: MatchCardProps) {
  return (
    <div className="flex w-full bg-white border border-[#E5E7EB] hover:border-[#FFA000] transition-all duration-200 rounded-xl p-4 shadow-sm flex-row items-center text-left gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-[#EA580C] uppercase tracking-wider bg-[#FFF7ED] border border-[#FFEDD5] px-2 py-0.5 rounded-md">
            AI Match
          </span>
          {entity && <h3 className="text-[14px] font-bold text-[#1F1F1F] truncate">{entity}</h3>}
        </div>
        <p className="text-[13px] text-[#747775] line-clamp-2 leading-relaxed font-normal">
          {description}
        </p>
      </div>
    </div>
  );
}