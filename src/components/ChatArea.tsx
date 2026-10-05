'use client';
import React, { useMemo } from 'react';
import { Sparkles, User } from 'lucide-react';
import { useUser } from './UserProvider';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { MatchPanel } from './MatchPanel';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  type?: 'intro' | 'conversation' | 'clarification' | 'complete' | 'error' | 'deal_ready' | 'deal_saved' | 'new_chat_prompt';
  file?: {
    name: string;
    url?: string;
  };
  questions?: string[];
  proposalId?: string | null;
}

interface ChatAreaProps {
  messages: Message[];
  onQuestionClick?: (question: string) => void;
  isTyping?: boolean;
  activeProposalId?: string | null;
  onStartOver?: () => void;
}

export default function ChatArea({
  messages,
  isTyping,
  onQuestionClick,
  activeProposalId,
  onStartOver,
}: ChatAreaProps) {
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

  // Determine which message index should have the MatchPanel rendered immediately below it
  const matchPanelIndex = useMemo(() => {
    if (!activeProposalId || messages.length === 0) return -1;

    // 1. Check if a message explicitly matches this activeProposalId
    const byPropId = messages.findIndex(m => m.proposalId === activeProposalId);
    if (byPropId !== -1) return byPropId;

    // 2. Check if a message has type === 'complete'
    const byComplete = messages.findIndex(m => m.role === 'assistant' && m.type === 'complete');
    if (byComplete !== -1) return byComplete;

    // 3. Keyword heuristic for mandate completion message
    const byKeyword = messages.findIndex(m =>
      m.role === 'assistant' && (
        m.content.includes('mandate is active') ||
        m.content.includes('Deal captured') ||
        m.content.includes('identify aligned counterparties') ||
        m.content.includes('view current matches in your Deal Log')
      )
    );
    if (byKeyword !== -1) return byKeyword;

    // 4. Fallback: place after the last assistant message that was part of the qualification
    const lastAssistantIdx = messages.map(m => m.role).lastIndexOf('assistant');
    if (lastAssistantIdx !== -1) return lastAssistantIdx;

    return messages.length - 1;
  }, [messages, activeProposalId]);

  return (
    <div className="space-y-8 chat-container-max py-4">
      {messages.map((msg, index) => (
        <React.Fragment key={msg.id}>
          <div
            className={`flex items-start gap-4 w-full animate-in fade-in duration-500 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* User Avatar Icon (Keep blank for assistant) */}
            {msg.role === 'user' ? (
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 transition-all overflow-hidden bg-white border border-[#E5E7EB] text-[#1F1F1F]">
                {profile?.userAvatar ? (
                  <Image src={profile.userAvatar} alt="User" width={28} height={28} className="w-full h-full object-cover" />
                ) : (
                  <User size={14} className="text-[#444746]" />
                )}
              </div>
            ) : (
              <div className="w-0 shrink-0" />
            )}

            <div className={`flex flex-col gap-2 max-w-[85%] sm:max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`px-4 py-3 shadow-sm transition-all ${isHomePage
                    ? (msg.role === 'user'
                      ? 'bg-[#F3F4F6] text-[#1F1F1F] rounded-[24px] border border-[#E5E7EB]'
                      : 'bg-[#F9FAFB] text-[#1F1F1F] rounded-[24px] border border-[#E5E7EB]')
                    : (msg.role === 'user'
                      ? 'bg-white text-[#111111] rounded-2xl rounded-tr-sm border border-[rgba(17,17,17,0.08)]'
                      : 'bg-[rgba(255,255,255,0.72)] backdrop-blur-md text-[#111111] rounded-2xl rounded-tl-sm border border-[rgba(17,17,17,0.08)]')
                  }`}
              >
                {msg.file && (
                  <div className={`mb-3 p-2.5 rounded-2xl flex items-center gap-2 border ${isHomePage
                      ? 'bg-white border-[#E5E7EB]'
                      : (msg.role === 'user' ? 'bg-[#F5F5F3] border-[rgba(17,17,17,0.04)]' : 'bg-transparent border-[rgba(17,17,17,0.08)]')
                    }`}>
                    <div className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center">
                      <span className="text-sm">📄</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${isHomePage ? 'text-[#1F1F1F]' : (msg.role === 'user' ? 'text-[#0F172A]' : 'text-foreground')}`}>
                        {msg.file.name}
                      </p>
                      <p className={`text-[9px] uppercase tracking-wider font-bold ${isHomePage ? 'text-[#444746]' : (msg.role === 'user' ? 'text-[#64748B]' : 'text-brand-secondary/60')}`}>
                        Document Attachment
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-normal">
                  {msg.content}
                </p>
              </div>

              {msg.role === 'assistant' && msg.type === 'complete' && (
                <div className={`mt-2 p-3 ${isHomePage ? 'bg-[#DCFCE7] border border-[#86EFAC] text-[#15803D]' : 'bg-brand-card border border-border text-[#2F855A]'} rounded-xl flex items-center gap-2 text-xs font-medium animate-in zoom-in duration-500 shadow-sm`}>
                  <div className="w-5 h-5 rounded-md bg-[#16A34A] flex items-center justify-center text-white shrink-0">
                    <Sparkles size={10} />
                  </div>
                  <span>Deal captured and intelligence extracted successfully.</span>
                </div>
              )}
              {msg.role === 'assistant' && msg.questions && msg.questions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.questions.map((q, idx) => {
                    const isNewChatAction = q.toLowerCase().includes('new conversation') || q.toLowerCase().includes('new chat');
                    if (isNewChatAction) {
                      return (
                        <button
                          key={idx}
                          onClick={() => onQuestionClick?.(q)}
                          className="text-xs text-[#747775] hover:text-[#1F1F1F] font-medium underline underline-offset-2 transition-colors cursor-pointer py-1"
                        >
                          {q}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={idx}
                        onClick={() => onQuestionClick?.(q)}
                        className={`text-xs font-semibold px-4 py-2 rounded-full transition-all active:scale-95 shadow-sm flex items-center gap-1.5 cursor-pointer ${
                          isHomePage
                            ? 'bg-[#F3F4F6] hover:bg-[#FFF7ED] text-[#1F1F1F] border border-[#E5E7EB] hover:border-[#FF6A00]/40 hover:text-[#FF6A00]'
                            : 'bg-white border border-[rgba(17,17,17,0.08)] hover:border-[#FF6A00]/50 hover:bg-[#F5F5F3] text-[#4B5563] hover:text-[#111111]'
                        }`}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Render MatchPanel immediately following the completion message */}
          {activeProposalId && index === matchPanelIndex && (
            <div className="w-full my-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <MatchPanel
                proposalId={activeProposalId}
                onStartOver={onStartOver || (() => {})}
              />
            </div>
          )}
        </React.Fragment>
      ))}

      {isTyping && (
        <div className="flex items-center gap-3 w-full animate-in fade-in duration-300 py-1">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-pulse shrink-0" />
            <span className="text-[12px] font-normal text-[#747775] transition-all duration-300">
              {processWords[processStep]}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
