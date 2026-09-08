import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import type { GuideDoc } from '@/lib/guideData';
import { guideIcon } from './guideIcons';

interface GuideCardProps {
  doc: GuideDoc;
  categoryLabel: string;
}

export default function GuideCard({ doc, categoryLabel }: GuideCardProps) {
  const Icon = guideIcon(doc.icon);

  return (
    <Link
      href={`/guide/${doc.slug}`}
      className="group flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-6 min-h-[250px] shadow-sm transition-all duration-200 hover:border-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl bg-[#F3F4F6] border border-[#E5E7EB] p-3 text-[#FF6A00] transition-colors group-hover:bg-[#FFF7ED]">
            <Icon size={20} />
          </div>
          <ArrowUpRight
            size={18}
            className="mt-1 shrink-0 text-[#747775] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black"
          />
        </div>
        <h3 className="mt-4 text-[16px] font-bold text-black leading-snug">{doc.title}</h3>
        <p className="mt-2 text-xs font-normal leading-relaxed text-[#4B5563] line-clamp-4">{doc.description}</p>
      </div>
      <div className="mt-6 pt-2 flex items-center justify-between gap-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#747775]">
        <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-1 text-black font-semibold">{categoryLabel}</span>
        <span className="flex items-center gap-1 font-medium">
          <Clock3 size={12} /> {doc.readingTimeMinutes} min read
        </span>
      </div>
    </Link>
  );
}
