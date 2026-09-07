import React from 'react';
import { BookOpen } from 'lucide-react';

interface GuideHeroProps {
  title: string;
  description: string;
}

export default function GuideHero({ title, description }: GuideHeroProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-[#F3F4F6] border border-[#E5E7EB] p-3 text-[#FF6A00] shrink-0">
          <BookOpen size={24} />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1F1F1F]">{title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm font-normal leading-relaxed text-[#747775]">{description}</p>
        </div>
      </div>
    </div>
  );
}
