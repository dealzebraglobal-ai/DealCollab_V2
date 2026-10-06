'use client';
import React from 'react';

interface DealCardProps {
  title: string;
  description: string;
}

export default function DealCard({ title, description }: DealCardProps) {
  return (
    <div className="flex-1 h-full bg-white border border-[#E5E7EB] hover:border-gray-400 transition-all duration-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between text-left gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="text-[16px] font-semibold text-[#1F1F1F] mb-1 leading-snug">{title}</h3>
        <p className="text-[13px] text-[#747775] leading-relaxed font-normal line-clamp-2">
          {description}
        </p>
      </div>
    </div>
  );
}
