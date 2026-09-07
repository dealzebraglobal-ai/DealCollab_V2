import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import type { GuideDoc } from '@/lib/guideData';
import { GUIDE_ICONS } from './guideIcons';
import { BookOpen } from 'lucide-react';

interface GuideCardProps {
  doc: GuideDoc;
  categoryLabel: string;
}

export default function GuideCard({ doc, categoryLabel }: GuideCardProps) {
  const Icon = GUIDE_ICONS[doc.icon] || BookOpen;

  return (
    <Link
      href={`/guide/${doc.slug}`}
      className="group flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm transition-all duration-200 hover:border-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl bg-[#F3F4F6] border border-[#E5E7EB] p-2.5 text-[#FF6A00] transition-colors group-hover:bg-[#FFF7ED]">
            <Icon size={18} />
          </div>
          <ArrowUpRight
            size={16}
            className="mt-1 shrink-0 text-[#747775] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black"
          />
        </div>
        <h3 className="mt-3.5 text-[15px] font-medium text-[#1F1F1F]">{doc.title}</h3>
        <p className="mt-1 text-xs font-normal leading-relaxed text-[#747775] line-clamp-2">{doc.description}</p>
      </div>
      <div className="mt-5 flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-wider text-[#747775]">
        <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[#444746]">{categoryLabel}</span>
        <span className="flex items-center gap-1">
          <Clock3 size={11} /> {doc.readingTimeMinutes} min read
        </span>
      </div>
    </Link>
  );
}
