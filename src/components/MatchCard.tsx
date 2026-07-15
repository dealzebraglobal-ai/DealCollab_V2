'use client';
import React from 'react';

interface MatchCardProps {
  entity: string;
  description: string;
}

export default function MatchCard({ entity, description }: MatchCardProps) {
  return (
    <div className="flex-1 bg-white border border-[#E5E7EB] rounded-lg p-4 shadow-sm hover:border-[#F97316]/20 transition-all">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider bg-[#F97316]/5 px-1.5 py-0.5 rounded">AI Match</span>
        <h3 className="text-[15px] font-bold text-[#1F2937]">{entity}</h3>
      </div>
      <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
        {description}
      </p>
    </div>
  );
}