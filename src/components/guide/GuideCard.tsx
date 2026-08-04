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
      className="group flex flex-col justify-between rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-100 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/40"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-2xl bg-orange-50 p-3 text-[#F97316] transition-colors group-hover:bg-[#F97316] group-hover:text-white">
            <Icon size={20} />
          </div>
          <ArrowUpRight
            size={18}
            className="mt-1 shrink-0 text-gray-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#F97316]"
          />
        </div>
        <h3 className="mt-4 text-base font-black text-gray-950">{doc.title}</h3>
        <p className="mt-1.5 text-sm font-medium leading-relaxed text-gray-500">{doc.description}</p>
      </div>
      <div className="mt-5 flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-gray-400">
        <span className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 text-gray-500">{categoryLabel}</span>
        <span className="flex items-center gap-1">
          <Clock3 size={12} /> {doc.readingTimeMinutes} min read
        </span>
      </div>
    </Link>
  );
}
