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
    <div className="w-full bg-white/90 border-b border-[#E5E7EB] py-4 px-6 sm:px-10 md:pr-56 flex items-center justify-between sticky top-0 z-40 shadow-xs backdrop-blur-md">
      <div className="flex items-center gap-3 min-w-0">
        {showBack && (
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="p-2 hover:bg-[#F3F4F6] rounded-xl transition-all text-[#747775] hover:text-[#1F1F1F]"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 overflow-hidden">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <span className="text-xs text-[#E5E7EB]">/</span>}
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="text-sm font-semibold text-[#747775] hover:text-[#1F1F1F] transition-colors"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={`text-sm truncate ${isLast ? 'font-bold text-[#1F1F1F] tracking-tight' : 'font-semibold text-[#747775]'}`}
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
