'use client';
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ProfileDropdown from '@/components/ProfileDropdown';
import MobileNavbar from '@/components/MobileNavbar';
import { usePathname } from 'next/navigation';
import { useUser } from '@/components/UserProvider';
import { Coins, X } from 'lucide-react';
import Link from 'next/link';
import { useChat } from './ChatProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { tokens } = useUser();
  const { createNewChat } = useChat();
  const pathname = usePathname();
  
  const isStandalonePage = pathname?.includes('/eoi-review');

  return (
    <div className="flex flex-col md:flex-row h-screen bg-transparent font-sans antialiased text-foreground overflow-y-auto md:overflow-hidden">
      
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[90] md:hidden backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
 
      {/* Sidebar - Desktop (Fixed/Collapsed) & Mobile (Slide-in) */}
      {!isStandalonePage && (
        <div 
          className={`
            fixed md:relative z-[100] h-full bg-brand-sidebar transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
            ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            ${isSidebarCollapsed ? 'md:w-[80px]' : 'md:w-[260px]'}
            w-[280px] md:w-auto shrink-0 border-r border-border
          `}
        >
          {/* Mobile Close Button */}
          <button 
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl hover:bg-primary/10 active:scale-95 transition-all z-[110]"
          >
            <X size={20} className="text-brand-secondary" />
          </button>
 
          <Sidebar 
            isCollapsed={isSidebarCollapsed} 
            onItemClick={() => setIsMobileSidebarOpen(false)}
          />
        </div>
      )}
      
      <div className="flex-1 flex flex-col relative h-full bg-transparent">
        
        {/* Mobile Navbar */}
        {!isStandalonePage && (
          <MobileNavbar 
            onMenuClick={() => setIsMobileSidebarOpen(true)} 
            onNewChat={createNewChat}
          />
        )}
 
        {/* Desktop Header (Profile & Tokens) */}
        {!isStandalonePage && (
          <div className="hidden md:flex absolute top-6 right-8 z-50 items-center gap-3">
            <Link 
              href="/profile/tokens"
              data-onboarding-target="tokens"
              className="flex items-center gap-2 px-4 py-2 bg-brand-sidebar border border-border rounded-full transition-all hover:bg-[#222222] group shadow-sm"
            >
              <Coins size={14} className="text-primary-hover" />
              <span className="text-xs font-bold text-[#F5F5F3]">
                {typeof tokens === 'number' ? tokens : '...'} Tokens
              </span>
            </Link>
            <ProfileDropdown />
          </div>
        )}
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col w-full h-full relative overflow-y-auto bg-transparent">
          {children}
        </main>
      </div>
    </div>
  );
}
