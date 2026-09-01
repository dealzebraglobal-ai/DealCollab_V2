'use client';
import React, { useState, useRef, useEffect } from 'react';
import { User, Coins, CreditCard, LogOut, LifeBuoy } from 'lucide-react';
import { useUser } from './UserProvider';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import HelpSupportModal from './HelpSupportModal';

export default function ProfileDropdown() {
  const { tokens, logout, profile } = useUser();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-10 h-10 rounded-full bg-white border border-brand-border flex items-center justify-center hover:bg-gray-50 transition-all active:scale-95 shadow-sm overflow-hidden"
      >
        {profile?.userAvatar ? (
          <Image src={profile.userAvatar} alt="Profile" width={40} height={40} className="w-full h-full object-cover" />
        ) : (
          <User size={18} className="text-foreground" />
        )}
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-[8px] font-bold text-white rounded-full flex items-center justify-center border border-white shadow-sm">
          {(tokens ?? 0) > 999 ? '9k+' : (tokens ?? 0)}
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-64 rounded-[24px] bg-white border border-border shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-2 animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] z-50 origin-top-right">
          <div className="px-5 py-4 mb-2 border-b border-primary-soft">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-black text-foreground tracking-tight">
                {profile?.fullName || session?.user?.name || session?.user?.email?.split('@')[0] || 'User'}
              </p>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary rounded-full border border-primary/20 shadow-sm">
                <Coins size={12} className="text-white" />
                <span className="text-[10px] font-black text-white">{tokens}</span>
              </div>
            </div>
            <p className="text-[11px] text-brand-secondary font-bold tracking-wide">
              {profile?.email || session?.user?.email || 'No email provided'}
            </p>
          </div>
          
          <div className="flex flex-col gap-0.5">
            <Link 
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-brand-secondary hover:text-foreground hover:bg-primary-soft transition-all duration-200 text-sm w-full text-left active:scale-[0.97] group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-soft/50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                <User size={16} className="group-hover:text-primary-hover transition-colors" />
              </div>
              <span className="font-bold">Profile Settings</span>
            </Link>
            <Link 
              href="/profile/tokens"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-brand-secondary hover:text-foreground hover:bg-primary-soft transition-all duration-200 text-sm w-full text-left active:scale-[0.97] group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-soft/50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                <Coins size={16} className="group-hover:text-primary-hover transition-colors" />
              </div>
              <span className="font-bold">Token Usage</span>
            </Link>
            <Link 
              href="/profile/billing"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-brand-secondary hover:text-foreground hover:bg-primary-soft transition-all duration-200 text-sm w-full text-left active:scale-[0.97] group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-soft/50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                <CreditCard size={16} className="group-hover:text-primary-hover transition-colors" />
              </div>
              <span className="font-bold">Billing</span>
            </Link>
            <button 
              onClick={() => {
                setIsOpen(false);
                setIsSupportOpen(true);
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-brand-secondary hover:text-foreground hover:bg-primary-soft transition-all duration-200 text-sm w-full text-left active:scale-[0.97] group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-soft/50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                <LifeBuoy size={16} className="group-hover:text-primary-hover transition-colors" />
              </div>
              <span className="font-bold">Help & Support</span>
            </button>
            
            <div className="my-2 border-t border-primary-soft mx-2" />
            
            <button 
              onClick={() => logout()}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all duration-200 text-sm w-full text-left active:scale-[0.97] group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-red-50/50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                <LogOut size={16} className="group-hover:text-red-600 transition-colors" />
              </div>
              <span className="font-bold">Logout</span>
            </button>
          </div>
        </div>
      )}

      <HelpSupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        userEmail={profile?.email || session?.user?.email}
      />
    </div>
  );
}

