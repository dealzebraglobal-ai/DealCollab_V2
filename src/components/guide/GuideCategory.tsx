import React from 'react';
import type { GuideCategoryMeta, GuideDoc } from '@/lib/guideData';
import { GUIDE_ICONS } from './guideIcons';
import { BookOpen } from 'lucide-react';
import GuideSection from './GuideSection';
import GuideCard from './GuideCard';

interface GuideCategoryProps {
  category: GuideCategoryMeta;
  docs: GuideDoc[];
}

export default function GuideCategory({ category, docs }: GuideCategoryProps) {
  if (docs.length === 0) return null;
  const Icon = GUIDE_ICONS[category.icon] || BookOpen;

  return (
    <GuideSection title={category.label} description={category.description} icon={<Icon size={16} />}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc) => (
          <GuideCard key={doc.slug} doc={doc} categoryLabel={category.label} />
        ))}
      </div>
    </GuideSection>
  );
}
