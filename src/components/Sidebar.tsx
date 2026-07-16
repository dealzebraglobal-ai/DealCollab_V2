'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  FileText, 
  Bell, 
  Sparkles, 
  Plus, 
  MessageSquare, 
  Trash2,
  User,
  LayoutDashboard
} from 'lucide-react';
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
    { name: 'Home', icon: MessageSquare, href: '/home' },
    { name: 'Deal Log', icon: FileText, href: '/deal-log' },
    { name: 'Deal Dashboard', icon: LayoutDashboard, href: '/deal-dashboard' },
    { name: 'Intelligence', icon: Sparkles, href: '/deal-intelligence' },
    { name: 'Notifications', icon: Bell, href: '/notifications', badge: unreadCount },
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
    <aside className="w-full h-full bg-brand-sidebar flex flex-col py-8 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] border-r border-border">
      {/* Top Section: Logo */}
      <div className="mb-10 px-6">
        <Link href="/home" className={`group flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} overflow-hidden`}>
          <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center shrink-0 shadow-lg shadow-black/5 transition-transform duration-500 group-hover:scale-105 relative overflow-hidden ring-1 ring-white/10">
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
            <span className="text-[#F5F5F3] font-black text-base tracking-tighter whitespace-nowrap">
              DealCollab <span className="text-primary-hover">AI</span>
            </span>
          )}
        </Link>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <nav className="flex flex-col gap-1.5 px-4 mb-8">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onItemClick?.()}
                className={`group flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3'} py-3 rounded-xl transition-all duration-300 w-full text-left ${
                  isActive 
                    ? 'text-[#F5F5F3] bg-[#1A1A1A] font-bold shadow-sm ring-1 ring-white/10' 
                    : 'text-[#888888] hover:text-[#F5F5F3] hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={20} className={`shrink-0 transition-all duration-300 ${isActive ? 'text-[#FF6A00]' : 'group-hover:text-[#F5F5F3]'}`} />
                  {!isCollapsed && <span className="text-[13px] tracking-tight">{item.name}</span>}
                </div>
                {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                  <span className={`${isActive ? 'bg-[#FF6A00] text-white' : 'bg-[#1A1A1A] text-[#F5F5F3] ring-1 ring-white/10'} text-[10px] font-bold px-1.5 py-0.5 rounded-full`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {pathname === '/home' && (
          <>
            {/* New Chat Button */}
            <div className="px-4 mb-6">
              <button 
                onClick={handleNewChat}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3.5 rounded-2xl bg-primary hover:bg-primary-hover transition-all text-[13px] font-bold text-white group shadow-md shadow-primary/20 active:scale-95`}
              >
                <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                {!isCollapsed && <span>New Conversation</span>}
              </button>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto px-4 space-y-1.5 scrollbar-hide">
              {!isCollapsed && sessions.length > 0 && (
                <h3 className="px-3 text-[10px] font-bold text-brand-secondary uppercase tracking-widest mb-3 mt-4">History</h3>
              )}
              
              {sessions.map((session) => (
                <div 
                  key={session.id}
                  onClick={() => handleChatClick(session.id)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-300 ${
                    activeChatId === session.id 
                      ? 'bg-[#1A1A1A] border border-white/10 shadow-sm text-[#F5F5F3] font-semibold' 
                      : 'text-[#888888] hover:bg-white/5 hover:text-[#F5F5F3]'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <MessageSquare size={16} className={`shrink-0 ${activeChatId === session.id ? 'text-[#FF6A00]' : 'opacity-40'}`} />
                    {!isCollapsed && <span className="text-xs truncate">{session.title}</span>}
                  </div>
                  {!isCollapsed && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all active:scale-90"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-auto px-4 py-4 border-t border-border">
         <Link 
           href="/profile"
           className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-2'} py-3 rounded-2xl hover:bg-primary/10 transition-all group`}
         >
           <div className="w-9 h-9 rounded-full bg-transparent border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-sm relative">
             {profile?.userAvatar ? (
               <Image src={profile.userAvatar} alt="Avatar" width={36} height={36} className="w-full h-full object-cover" />
             ) : (
               <User size={18} className="text-[#F5F5F3]" />
             )}
           </div>
           {!isCollapsed && (
             <div className="flex flex-col min-w-0">
               <p className="text-xs font-black text-[#F5F5F3] truncate uppercase tracking-tight">
                 {profile?.fullName || session?.user?.name || 'User'}
               </p>
               <p className="text-[10px] text-[#888888] truncate font-bold opacity-60">
                 {profile?.email || session?.user?.email || ''}
               </p>
             </div>
           )}
         </Link>
         
         <p className="text-[10px] text-brand-secondary font-medium text-center uppercase tracking-widest mt-4 opacity-40">
            {isCollapsed ? 'DC' : 'DealCollab v2.0'}
         </p>
      </div>
    </aside>
  );
}
