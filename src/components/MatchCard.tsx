'use client';
import React from 'react';

interface MatchCardProps {
  entity: string;
  description: string;
}

export default function MatchCard({ entity, description }: MatchCardProps) {
  return (
    <div className="flex-1 h-full bg-white border border-[#E5E7EB] hover:border-black transition-all duration-200 rounded-xl p-5 shadow-sm flex flex-col justify-center items-center text-center">
      <div className="flex items-center justify-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[11px] font-medium text-[#EA580C] uppercase tracking-wider bg-[#FFF7ED] border border-[#FFEDD5] px-2.5 py-0.5 rounded-full">
          AI Match
        </span>
        {entity && <h3 className="text-[17px] font-medium text-[#1F1F1F]">{entity}</h3>}
      </div>
      <p className="text-sm text-[#747775] line-clamp-2 leading-relaxed text-center font-normal">
        {description}
      </p>
    </div>
  );
}