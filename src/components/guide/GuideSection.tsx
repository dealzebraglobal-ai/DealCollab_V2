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
        {icon && <div className="rounded-xl bg-[#F3F4F6] border border-[#E5E7EB] p-2 text-[#FF6A00]">{icon}</div>}
        <div>
          <h2 className="text-lg font-bold text-[#1F1F1F]">{title}</h2>
          {description && <p className="text-xs font-normal text-[#747775]">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
