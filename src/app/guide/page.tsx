'use client';
import React, { useMemo, useState } from 'react';
import { GUIDE_CATEGORIES, GUIDE_DOCS } from '@/lib/guideData';
import GuideHeader from '@/components/guide/GuideHeader';
import GuideHero from '@/components/guide/GuideHero';
import GuideSearch from '@/components/guide/GuideSearch';
import GuideCategory from '@/components/guide/GuideCategory';
import GuideCard from '@/components/guide/GuideCard';
import GuideSidebar from '@/components/guide/GuideSidebar';
import { SearchX } from 'lucide-react';

export default function GuideIndexPage() {
  const [query, setQuery] = useState('');

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GUIDE_DOCS;
    return GUIDE_DOCS.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q)
    );
  }, [query]);

  const categoryLabel = (id: string) => GUIDE_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="relative flex-1 flex flex-col w-full bg-white h-full">
      <GuideHeader items={[{ label: 'Home', href: '/home' }, { label: 'Guide & Trust' }]} showBack={false} />

      <div className="flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl">
          <GuideHero
            title="Guide & Trust"
            description="Understand how DealCollab AI works, how matching happens, how tokens work, privacy, security, platform rules, and frequently asked questions."
          />

          <div className="mt-8">
            <GuideSearch value={query} onChange={setQuery} resultCount={filteredDocs.length} />
          </div>

          <div className="mt-8 flex flex-col gap-10">
            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] py-16 text-center">
                <SearchX size={28} className="text-gray-400" />
                <p className="text-sm font-medium text-[#747775]">No guide articles match &ldquo;{query}&rdquo;.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {filteredDocs.map((doc) => (
                  <GuideCard key={doc.slug} doc={doc} categoryLabel={categoryLabel(doc.category)} />
                ))}
              </div>
            )}

            {/* Platform Trust & Quick Help Footer Section */}
            <div className="mt-6 pt-8 border-t border-[#E5E7EB]">
              <GuideSidebar />
            </div>
          </div>

          <div className="h-10 shrink-0" />
        </div>
      </div>
    </div>
  );
}
