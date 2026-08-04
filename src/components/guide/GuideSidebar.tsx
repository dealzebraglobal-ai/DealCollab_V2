import React from 'react';
import { Download, LifeBuoy, MessageCircle, PlayCircle } from 'lucide-react';

/**
 * Secondary "quick actions" panel for the Guide index — not the app's main
 * left-hand navigation (that stays src/components/Sidebar.tsx, unchanged).
 */
export default function GuideSidebar() {
  const actions = [
    { label: 'Download PDF', icon: Download, href: '/guide/how-it-works', description: 'Save the core guide for offline reading.' },
    { label: 'Watch Walkthrough', icon: PlayCircle, href: '/guide/how-it-works', description: 'A short walkthrough of the platform.' },
    { label: 'Contact Support', icon: MessageCircle, href: 'mailto:support@dealcollab.in', description: 'Reach the team directly.' },
  ];

  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Quick actions</h3>
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 transition-all hover:border-orange-100 hover:bg-orange-50/40"
            >
              <div className="rounded-xl bg-white p-2 text-[#F97316] shadow-sm">
                <action.icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900">{action.label}</p>
                <p className="truncate text-xs font-semibold text-gray-400">{action.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-orange-100 bg-orange-50 p-5">
        <div className="flex items-center gap-2 text-[#F97316]">
          <LifeBuoy size={18} />
          <h3 className="text-sm font-black">Need help?</h3>
        </div>
        <p className="mt-2 text-xs font-semibold leading-relaxed text-orange-900/70">
          Can&apos;t find what you&apos;re looking for? Our team typically replies within a few hours.
        </p>
        <a
          href="mailto:support@dealcollab.in"
          className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[#1F2937] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#F97316]"
        >
          Email support
        </a>
      </div>
    </aside>
  );
}
