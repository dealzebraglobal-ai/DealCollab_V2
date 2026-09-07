'use client';
import React from 'react';

interface DealCardProps {
  title: string;
  description: string;
}

export default function DealCard({ title, description }: DealCardProps) {
  return (
    <div className="flex-1 h-full bg-white border border-[#E5E7EB] hover:border-black transition-all duration-200 rounded-xl p-5 shadow-sm flex flex-col justify-center items-center text-center">
      <h3 className="text-[17px] font-medium text-[#1F1F1F] mb-1.5">{title}</h3>
      <p className="text-sm text-[#747775] line-clamp-2 leading-relaxed font-normal text-center">
        {description}
      </p>
    </div>
  );
}
