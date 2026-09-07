'use client';
import React from 'react';
import { Menu, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { useUser } from './UserProvider';
import Image from 'next/image';

interface MobileNavbarProps {
  onMenuClick: () => void;
  onNewChat: () => void;
}

export default function MobileNavbar({ onMenuClick, onNewChat }: MobileNavbarProps) {
  const { profile } = useUser();

  return (
    <nav className="md:hidden sticky top-0 z-50 w-full bg-white border-b border-[#E5E7EB] text-gray-900 h-16 flex items-center justify-between px-4">
      <div className="flex items-center gap-1">
        <button 
          onClick={onMenuClick}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-900 active:scale-95 transition-all"
        >
          <Menu size={24} />
        </button>

        <Link href="/profile" className="w-8 h-8 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center overflow-hidden active:scale-90 transition-all relative">
          {profile?.userAvatar ? (
            <Image src={profile.userAvatar} alt="Avatar" width={32} height={32} className="w-full h-full object-cover" />
          ) : (
            <User size={14} className="text-gray-700" />
          )}
        </Link>
        <Link href="/home" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shrink-0">
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    src="/earth.mp4"
                    className="w-full h-full object-cover scale-125"
                />
            </div>
            <span className="font-bold text-sm tracking-tight text-[#1F1F1F]">DealCollab <span className="text-[#FF6A00]">AI</span></span>
        </Link>
      </div>
      
      <button 
        onClick={onNewChat}
        className="w-12 h-12 bg-[#FF6A00] shadow-orange-500/20 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all"
      >
        <Plus size={24} />
      </button>
    </nav>
  );
}
