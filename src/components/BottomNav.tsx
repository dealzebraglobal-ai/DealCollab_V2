'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, LayoutDashboard, Bell, User } from 'lucide-react';
import { useNotifications } from './NotificationProvider';

export default function BottomNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();

  const navItems = [
    { name: 'Home', href: '/home', icon: Home },
    { name: 'Deals', href: '/deal-log', icon: FileText },
    { name: 'Dash', href: '/deal-dashboard', icon: LayoutDashboard },
    { name: 'Alerts', href: '/notifications', icon: Bell, badge: unreadCount },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-[#E5E7EB] px-2 py-3 z-50 flex justify-around items-center shadow-[0_-1px_10px_rgba(0,0,0,0.02)] animate-in slide-in-from-bottom duration-700">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href === '/deal-log' && pathname?.startsWith('/deal-log/'));
        return (
          <Link 
            key={item.href}
            href={item.href}
            className={`relative flex flex-col items-center gap-1 min-w-[64px] transition-all duration-500 ease-out active:scale-90 ${
              isActive ? 'text-[#FF6A00]' : 'text-gray-400'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all duration-500 ease-out ${
              isActive ? 'bg-[#FFF7ED] scale-125' : 'bg-transparent group-hover:bg-gray-50'
            }`}>
              <item.icon size={20} className={`transition-all duration-500 ${isActive ? 'stroke-[2.5px] text-[#FF6A00]' : 'stroke-2 hover:scale-110'}`} />
            </div>
            <span className={`text-[10px] font-medium tracking-normal transition-all duration-500 ${
              isActive ? 'opacity-100 translate-y-0 scale-100 text-[#FF6A00]' : 'opacity-0 -translate-y-1 scale-90'
            }`}>
              {item.name}
            </span>
            
            {item.badge && item.badge > 0 && (
              <span className="absolute top-0 right-3 bg-[#FF6A00] text-white text-[8px] font-medium w-4 h-4 flex items-center justify-center rounded-full border-2 border-white animate-in zoom-in spin-in-90 duration-500">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
