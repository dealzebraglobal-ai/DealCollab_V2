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
        <div className="rounded-2xl bg-orange-50 p-3 text-[#F97316] shrink-0">
          <BookOpen size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );
}
