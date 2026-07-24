'use client';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export interface GuideBreadcrumbItem {
  label: string;
  href?: string;
}

interface GuideHeaderProps {
  items: GuideBreadcrumbItem[];
  /** Show a back-arrow button that calls router.back(). Defaults to true. */
  showBack?: boolean;
}

/**
 * Sticky breadcrumb bar — same shell as the deal detail page header
 * (src/app/(dashboard)/deal/[id]/page.tsx) so Guide & Trust reads as the
 * same application, not a different site.
 */
export default function GuideHeader({ items, showBack = true }: GuideHeaderProps) {
  const router = useRouter();

  return (
    <div className="w-full bg-white border-b border-gray-100 py-4 px-6 sm:px-10 flex items-center justify-between sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/80">
      <div className="flex items-center gap-4 min-w-0">
        {showBack && (
          <>
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-400 hover:text-[#1F2937]"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="h-4 w-[1px] bg-gray-100" />
          </>
        )}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 overflow-hidden">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <span className="text-[10px] text-gray-300">/</span>}
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="text-xs font-bold text-gray-400 hover:text-[#F97316] transition-colors"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={`text-xs truncate ${isLast ? 'font-black text-[#1F2937]' : 'font-bold text-gray-400'}`}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
