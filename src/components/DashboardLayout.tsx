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
  const [sidebarWidth, setSidebarWidth] = useState<number>(220);
  const [isResizing, setIsResizing] = useState(false);
  const { tokens } = useUser();
  const { createNewChat } = useChat();
  const pathname = usePathname();
  
  const isStandalonePage = pathname?.includes('/eoi-review');

  React.useEffect(() => {
    const saved = localStorage.getItem('dealcollab_sidebar_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 160 && parsed <= 450) {
        setSidebarWidth(parsed);
      }
    }
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, 160), 450);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('dealcollab_sidebar_width', String(sidebarWidth));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

  return (
    <div className={`flex flex-col md:flex-row h-screen bg-white text-gray-900 font-sans antialiased overflow-y-auto md:overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[90] md:hidden backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
 
      {/* Sidebar - Desktop (Resizable/Fixed) & Mobile (Slide-in) */}
      {!isStandalonePage && (
        <div 
          style={{ width: isMobileSidebarOpen ? undefined : `${sidebarWidth}px` }}
          className={`
            fixed md:relative z-[100] h-full bg-white border-r border-[#E5E7EB] transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
            ${isMobileSidebarOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full md:translate-x-0'}
            shrink-0 select-none
          `}
        >
          {/* Draggable resize scroll bar / handle on the right border */}
          <div
            onMouseDown={startResizing}
            onDoubleClick={() => {
              setSidebarWidth(220);
              localStorage.setItem('dealcollab_sidebar_width', '220');
            }}
            title="Drag to resize sidebar width / Double-click to reset"
            className={`hidden md:block absolute -right-1 top-0 bottom-0 w-2.5 cursor-col-resize z-[110] transition-colors ${
              isResizing ? 'bg-black/60' : 'hover:bg-black/30'
            }`}
          />

          {/* Mobile Close Button */}
          <button 
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 active:scale-95 transition-all z-[110]"
          >
            <X size={20} />
          </button>
 
          <Sidebar 
            isCollapsed={isSidebarCollapsed} 
            onItemClick={() => setIsMobileSidebarOpen(false)}
          />
        </div>
      )}
      
      <div className="flex-1 flex flex-col relative h-full bg-white">
        
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
              className="flex items-center gap-2 px-4 py-2 bg-[#F3F4F6] border border-[#E5E7EB] text-[#1F1F1F] hover:bg-[#EAEAEA] shadow-sm rounded-full transition-all group"
            >
              <Coins size={14} className="text-[#FF6A00]" />
              <span className="text-xs font-medium text-[#1F1F1F]">
                {typeof tokens === 'number' ? tokens : '...'} Tokens
              </span>
            </Link>
            <ProfileDropdown />
          </div>
        )}
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col w-full h-full relative overflow-y-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
