'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText,
  Bell,
  Plus,
  MessageSquare,
  Trash2,
  User,
  LayoutDashboard,
  BookOpen
} from 'lucide-react';
import BrainIcon from './icons/BrainIcon';
import { useNotifications } from './NotificationProvider';
import { useChat } from './ChatProvider';
import { useUser } from './UserProvider';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

interface SidebarProps {
  isCollapsed: boolean;
  onItemClick?: () => void;
}

export default function Sidebar({ isCollapsed, onItemClick }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const { sessions, activeChatId, loadChat, createNewChat, deleteChat } = useChat();
  const { profile } = useUser();
  const { data: session } = useSession();

  const menuItems = [
    { name: 'New Conversation', icon: Plus, href: '/home', isNewChat: true },
    { name: 'Deal Log', icon: FileText, href: '/deal-log', targetId: 'deal-log' },
    { name: 'EOI Activities', icon: LayoutDashboard, href: '/eoi-activities', targetId: 'deal-dashboard' },
    { name: 'Intelligence', icon: BrainIcon, href: '/deal-intelligence' },
    { name: 'Notifications', icon: Bell, href: '/notifications', badge: unreadCount },
    { name: 'Guide & Trust', icon: BookOpen, href: '/guide' },
  ];

  const handleChatClick = async (id: string) => {
    if (pathname !== '/home') {
      await router.push('/home');
    }
    await loadChat(id);
    onItemClick?.();
  };

  const handleNewChat = () => {
    createNewChat();
    if (pathname !== '/home') {
      router.push('/home');
    }
    onItemClick?.();
  };

  return (
    <aside className="w-full h-full bg-white border-r border-[#E5E7EB] flex flex-col py-6 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] font-['Segoe_UI_Variable','Segoe_UI',-apple-system,BlinkMacSystemFont,sans-serif] text-[#0F2747]">
      {/* Top Section: Logo */}
      <div className="mb-6 px-4">
        <Link href="/home" onClick={handleNewChat} className={`group flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} overflow-hidden`}>
          <div className="w-8 h-8 rounded-xl bg-foreground flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105 relative overflow-hidden">
            <video
              autoPlay
              loop
              muted
              playsInline
              src="/earth.mp4"
              className="w-full h-full object-cover scale-125"
            />
          </div>
          {!isCollapsed && (
            <span className="text-[#0F2747] font-normal text-[17px] leading-[24px] tracking-[-0.01em] whitespace-nowrap transition-colors">
              DealCollab <span className="text-[#FF6A00]">AI</span>
            </span>
          )}
        </Link>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <nav className="flex flex-col gap-1 px-2.5 mb-6">
          {menuItems.map((item) => {
            const isActive =
              item.href === '/guide'
                ? pathname === '/guide' || pathname?.startsWith('/guide/')
                : item.href === '/deal-log'
                  ? pathname === '/deal-log' || pathname?.startsWith('/deal-log/')
                  : item.href === '/eoi-activities'
                    ? pathname === '/eoi-activities' || pathname?.startsWith('/eoi-activities/') || pathname === '/deal-dashboard' || pathname?.startsWith('/deal-dashboard/')
                    : item.isNewChat
                      ? pathname === '/home' && !activeChatId
                      : pathname === item.href;

            const activeClass = 'text-[#0F2747] bg-[#FFF7ED] font-normal border border-[#FF6A00]/40 hover:border-[#0F2747] shadow-sm rounded-full';
            const inactiveClass = 'text-[#0F2747] hover:text-[#0F2747] hover:bg-[#F3F4F6] border border-transparent hover:border-[#0F2747] font-normal rounded-full';

            if (item.isNewChat) {
              return (
                <button
                  key={item.name}
                  onClick={handleNewChat}
                  className={`group flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3'} py-2 transition-all duration-200 w-full text-left ${
                    isActive ? activeClass : inactiveClass
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={18} className={`shrink-0 transition-all duration-200 ${
                      isActive ? 'text-[#FF6A00]' : 'text-[#0F2747] group-hover:text-[#0F2747]'
                    }`} />
                    {!isCollapsed && <span className="text-[16px] font-normal leading-[22px] tracking-[-0.01em] text-[#0F2747]">{item.name}</span>}
                  </div>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                data-onboarding-target={item.targetId}
                onClick={() => onItemClick?.()}
                className={`group flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3'} py-2 transition-all duration-200 w-full text-left ${
                  isActive ? activeClass : inactiveClass
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={18} className={`shrink-0 transition-all duration-200 ${
                    isActive ? 'text-[#FF6A00]' : 'text-[#0F2747] group-hover:text-[#0F2747]'
                  }`} />
                  {!isCollapsed && <span className="text-[16px] font-normal leading-[22px] tracking-[-0.01em] text-[#0F2747]">{item.name}</span>}
                </div>
                {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                  <span className={`${isActive ? 'bg-[#FF6A00] text-white shadow-sm' : 'bg-[#F3F4F6] text-[#0F2747] border border-[#E5E7EB]'} text-[11px] font-normal px-2 py-0.5 rounded-full`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Conversation History (Always Visible & Accessible across app) */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 sidebar-scroll border-t border-[#E5E7EB] pt-4">
          {!isCollapsed && (
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-[14px] font-normal leading-[20px] text-[#0F2747] tracking-[-0.01em]">Conversations</h3>
              {sessions.length > 0 && (
                <span className="text-[11px] font-normal text-[#0F2747] bg-[#F3F4F6] border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                  {sessions.length}
                </span>
              )}
            </div>
          )}

          {sessions.length === 0 && !isCollapsed && (
            <p className="px-3 text-[13px] leading-[18px] text-[#0F2747]/70 italic font-normal">No past conversations</p>
          )}

          {sessions.map((session) => {
            const isChatActive = pathname === '/home' && activeChatId === session.id;
            return (
              <div
                key={session.id}
                onClick={() => handleChatClick(session.id)}
                className={`group flex items-center justify-between px-3.5 py-1.5 cursor-pointer transition-all duration-200 ${
                  isChatActive
                    ? 'bg-[#FFF7ED] border border-[#FF6A00]/40 hover:border-[#0F2747] text-[#0F2747] font-normal rounded-full shadow-sm'
                    : 'text-[#0F2747] hover:bg-[#F3F4F6] hover:text-[#0F2747] border border-transparent hover:border-[#0F2747] font-normal rounded-full'
                } ${isCollapsed ? 'justify-center' : ''}`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <MessageSquare size={15} className={`shrink-0 ${isChatActive ? 'text-[#FF6A00]' : 'text-[#0F2747]/70 group-hover:text-[#0F2747]'}`} />
                  {!isCollapsed && <span className="text-[14.5px] font-normal leading-[20px] tracking-[-0.01em] text-[#0F2747] truncate">{session.title || 'Untitled Chat'}</span>}
                </div>
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-red-50 hover:text-red-600 text-[#0F2747]/70 transition-all active:scale-90"
                    title="Delete chat"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto px-3 py-2.5 border-t border-[#E5E7EB]">
        <Link
          href="/profile"
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 px-1.5'} py-2 rounded-full hover:bg-[#F3F4F6] transition-all group`}
        >
          <div className="w-8 h-8 rounded-full bg-transparent border border-[#E5E7EB] flex items-center justify-center shrink-0 overflow-hidden shadow-sm relative">
            {profile?.userAvatar ? (
              <Image src={profile.userAvatar} alt="Avatar" width={32} height={32} className="w-full h-full object-cover" />
            ) : (
              <User size={16} className="text-[#0F2747]" />
            )}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <p className="text-[15px] font-normal leading-[20px] tracking-[-0.01em] text-[#0F2747] truncate">
                {profile?.fullName || session?.user?.name || 'User'}
              </p>
              <p className="text-[12px] font-normal leading-[16px] text-[#0F2747]/80 truncate">
                {profile?.email || session?.user?.email || ''}
              </p>
            </div>
          )}
        </Link>

        <p className="text-[11px] font-normal leading-[16px] tracking-[-0.01em] text-[#0F2747]/70 text-center uppercase mt-2 opacity-80">
          {isCollapsed ? 'DC' : 'DealCollab v2.0'}
        </p>
      </div>
    </aside>
  );
}
