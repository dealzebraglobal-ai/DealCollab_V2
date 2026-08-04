import React from 'react';

interface GuideSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/** Generic titled section shell reused across the Guide index (per-category groups). */
export default function GuideSection({ title, description, icon, children }: GuideSectionProps) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        {icon && <div className="rounded-xl bg-gray-50 p-2 text-gray-500">{icon}</div>}
        <div>
          <h2 className="text-lg font-black text-gray-950">{title}</h2>
          {description && <p className="text-xs font-semibold text-gray-400">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
