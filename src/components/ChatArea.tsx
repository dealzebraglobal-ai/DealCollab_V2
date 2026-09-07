'use client';
import React from 'react';
import { Sparkles, User } from 'lucide-react';
import { useUser } from './UserProvider';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  type?: 'intro' | 'conversation' | 'clarification' | 'complete' | 'error' | 'deal_ready' | 'deal_saved';
  file?: {
    name: string;
    url?: string;
  };
  questions?: string[];
}

interface ChatAreaProps {
  messages: Message[];
  onQuestionClick?: (question: string) => void;
  isTyping?: boolean;
}

export default function ChatArea({ messages, isTyping, onQuestionClick }: ChatAreaProps) {
  const { profile } = useUser();
  const pathname = usePathname();
  const isHomePage = pathname === '/home';
  console.log("[ChatArea] Rendering with messages:", messages.length);

  const [processStep, setProcessStep] = React.useState(0);
  const processWords = [
    "Analyzing deal parameters & intent...",
    "Scanning intelligence network for matches...",
    "Structuring mandate criteria & financial scope...",
    "Evaluating strategic synergy & alignment...",
    "Synthesizing response..."
  ];

  React.useEffect(() => {
    if (!isTyping) {
      setProcessStep(0);
      return;
    }
    const interval = setInterval(() => {
      setProcessStep((prev) => (prev + 1) % processWords.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isTyping, processWords.length]);

  return (
    <div className="space-y-8 chat-container-max py-4">
      {messages.map((msg) => (
        <div 
          key={msg.id} 
          className={`flex items-start gap-4 w-full animate-in fade-in duration-500 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
        >
          {/* User Avatar Icon (Keep blank for assistant) */}
          {msg.role === 'user' ? (
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 transition-all overflow-hidden bg-white border border-[#E5E7EB] text-[#1F1F1F]">
              {profile?.userAvatar ? (
                <Image src={profile.userAvatar} alt="User" width={36} height={36} className="w-full h-full object-cover" />
              ) : (
                <User size={18} className="text-[#444746]" />
              )}
            </div>
          ) : (
            <div className="w-0 shrink-0" />
          )}
          
          <div className={`flex flex-col gap-2 max-w-[88%] sm:max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div 
              className={`px-6 py-4 shadow-sm transition-all ${
                isHomePage
                  ? (msg.role === 'user'
                      ? 'bg-[#F3F4F6] text-[#1F1F1F] rounded-[24px] border border-[#E5E7EB]'
                      : 'bg-[#F9FAFB] text-[#1F1F1F] rounded-[24px] border border-[#E5E7EB]')
                  : (msg.role === 'user' 
                      ? 'bg-white text-[#111111] rounded-2xl rounded-tr-sm border border-[rgba(17,17,17,0.08)]' 
                      : 'bg-[rgba(255,255,255,0.72)] backdrop-blur-md text-[#111111] rounded-2xl rounded-tl-sm border border-[rgba(17,17,17,0.08)]')
              }`}
            >
              {msg.file && (
                <div className={`mb-4 p-3 rounded-2xl flex items-center gap-3 border ${
                  isHomePage 
                    ? 'bg-white border-[#E5E7EB]'
                    : (msg.role === 'user' ? 'bg-[#F5F5F3] border-[rgba(17,17,17,0.04)]' : 'bg-transparent border-[rgba(17,17,17,0.08)]')
                }`}>
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center">
                    <span className="text-lg">📄</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${isHomePage ? 'text-[#1F1F1F]' : (msg.role === 'user' ? 'text-[#0F172A]' : 'text-foreground')}`}>
                      {msg.file.name}
                    </p>
                    <p className={`text-[10px] uppercase tracking-wider font-bold ${isHomePage ? 'text-[#444746]' : (msg.role === 'user' ? 'text-[#64748B]' : 'text-brand-secondary/60')}`}>
                      Document Attachment
                    </p>
                  </div>
                </div>
              )}
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap font-normal">
                {msg.content}
              </p>
            </div>
            
            {msg.role === 'assistant' && msg.type === 'complete' && (
              <div className={`mt-2 p-4 ${isHomePage ? 'bg-[#DCFCE7] border border-[#86EFAC] text-[#15803D]' : 'bg-brand-card border border-border text-[#2F855A]'} rounded-2xl flex items-center gap-3 text-sm font-medium animate-in zoom-in duration-500 shadow-sm`}>
                <div className="w-6 h-6 rounded-lg bg-[#16A34A] flex items-center justify-center text-white shrink-0">
                  <Sparkles size={12} />
                </div>
                <span>Deal captured and intelligence extracted successfully.</span>
              </div>
            )}
            {msg.role === 'assistant' && msg.questions && msg.questions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {msg.questions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => onQuestionClick?.(q)}
                    className={`text-xs font-medium px-4 py-2 rounded-full transition-all active:scale-95 shadow-sm ${
                      isHomePage
                        ? 'bg-[#F3F4F6] hover:bg-[#FFF7ED] text-[#1F1F1F] border border-[#E5E7EB] hover:border-[#FF6A00]/40 hover:text-[#FF6A00]'
                        : 'bg-white border border-[rgba(17,17,17,0.08)] hover:border-[#FF6A00]/50 hover:bg-[#F5F5F3] text-[#4B5563] hover:text-[#111111]'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {isTyping && (
        <div className="flex items-center gap-3 w-full animate-in fade-in duration-300 py-1">
          <div className="flex items-center gap-2.5 px-5 py-3.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[22px] shadow-sm">
            <div className="w-2 h-2 rounded-full bg-[#9CA3AF] animate-pulse shrink-0" />
            <span className="text-[14px] font-normal text-[#747775] transition-all duration-300">
              {processWords[processStep]}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
