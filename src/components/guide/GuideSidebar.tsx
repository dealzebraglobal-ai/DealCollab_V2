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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="md:col-span-2 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-black mb-4">Quick actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {actions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="group flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 transition-all hover:border-black hover:bg-white"
            >
              <div className="rounded-lg bg-white border border-[#E5E7EB] p-2 text-[#FF6A00] shadow-sm w-fit mb-3">
                <action.icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1F1F1F]">{action.label}</p>
                <p className="text-xs font-normal text-[#747775] mt-0.5 line-clamp-2">{action.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#FFEDD5] bg-[#FFF7ED] p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#EA580C]">
            <LifeBuoy size={18} />
            <h3 className="text-sm font-bold">Need help?</h3>
          </div>
          <p className="mt-2 text-xs font-normal leading-relaxed text-[#4B5563]">
            Can&apos;t find what you&apos;re looking for? Our team typically replies within a few hours.
          </p>
        </div>
        <a
          href="mailto:support@dealcollab.in"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#1F1F1F] px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-black"
        >
          Email support
        </a>
      </div>
    </div>
  );
}
