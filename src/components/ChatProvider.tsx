'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  type?: 'intro' | 'conversation' | 'clarification' | 'complete' | 'error' | 'deal_ready' | 'deal_saved';
  questions?: string[];
  file?: {
    name: string;
    url?: string;
  };
}

interface Session {
  id: string;
  title: string;
  createdAt: string;
}

interface ChatContextType {
  sessions: Session[];
  activeChatId: string | null;
  messages: Message[];
  loading: boolean;
  setActiveChatId: (id: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  fetchSessions: () => Promise<void>;
  loadChat: (id: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  createNewChat: () => void;
  documentId: string | null;
  setDocumentId: (id: string | null) => void;
  documentUrl: string | null;
  setDocumentUrl: (url: string | null) => void;
  documentText: string | null;
  setDocumentText: (text: string | null) => void;
  // Bug Fix 2: proposal ID for the active chat (set from completed session or live completion)
  activeProposalId: string | null;
  setActiveProposalId: (id: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);

  // Race-condition guard: each loadChat call gets a unique ID; stale async
  // responses check this ref before committing any state updates.
  const loadRequestRef = useRef(0);

  // Define the core fetching logic
  const performFetch = useCallback(async () => {
    if (!session?.user?.email) return;
    try {
      const res = await fetch('/api/chat/history');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSessions(data);
      } else if (data.success === false) {
        console.error('API Error:', data.error, data.stack);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, [session?.user?.email]);

  // Public fetchSessions that can be called from outside
  const fetchSessions = useCallback(async () => {
    await performFetch();
  }, [performFetch]);

  const loadChat = useCallback(async (id: string) => {
    // Race-condition guard: stamp this request; discard if a newer one started.
    const requestId = ++loadRequestRef.current;
    console.log(`[ChatProvider] loadChat START id=${id} requestId=${requestId}`);

    // BUG #2 fix: clear stale match panel immediately on chat switch so old
    // matches from a different session never leak into the new session view.
    setActiveProposalId(null);

    setLoading(true);
    setActiveChatId(id);
    try {
      // Single request: /api/chat/[id] now returns both messages and chat details
      const res = await fetch(`/api/chat/${id}`);
      if (requestId !== loadRequestRef.current) {
        console.log(`[ChatProvider] loadChat STALE id=${id} requestId=${requestId}, ignoring`);
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to load chat: ${res.status} ${res.statusText}`, text.slice(0, 200));
        setLoading(false);
        return;
      }
      const chatDetails = await res.json();
      if (requestId !== loadRequestRef.current) return;

      if (!chatDetails.success) {
        console.error(`[ChatProvider] loadChat error: ${chatDetails.error}`);
        setLoading(false);
        return;
      }

      // Restore messages
      if (Array.isArray(chatDetails.messages)) {
        setMessages(chatDetails.messages);
        console.log(`[ChatProvider] loadChat messages set: ${chatDetails.messages.length} msgs for id=${id}`);
      }

      // Restore document context
      if (chatDetails.document) {
        setDocumentId(chatDetails.document.id);
        setDocumentUrl(chatDetails.document.url);
        setDocumentText(chatDetails.document.extracted_text);
      }

      // Restore match panel proposalId.
      // Priority order:
      //   1. chatDetails.proposalId  — resolved server-side by /api/chat/[id]:
      //        a) state.proposal_id (new sessions with Bug Fix 2 applied)
      //        b) fallback DB lookup by user + intent + sector (old sessions)
      //   2. sessionStorage map  — written in-browser when deal completed this session
      //   3. null (no match panel)
      let restoredProposalId: string | null = chatDetails.proposalId ?? null;

      if (!restoredProposalId && typeof window !== 'undefined') {
        try {
          const map = JSON.parse(sessionStorage.getItem('dc_proposal_map') || '{}') as Record<string, string>;
          restoredProposalId = map[id] ?? null;
        } catch { /* ignore */ }
      }

      console.log(`[ChatProvider] loadChat proposalId restored: ${restoredProposalId} for chatId=${id}`);
      setActiveProposalId(restoredProposalId);
    } catch (err) {
      console.error('Failed to load chat:', err);
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, []);


  // Bug Fix 3: Persist activeChatId to sessionStorage so page refreshes can restore it.
  // Runs whenever activeChatId changes; clears the key when the chat is reset to null.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeChatId) {
      sessionStorage.setItem('dc_active_chat', activeChatId);
    } else {
      sessionStorage.removeItem('dc_active_chat');
    }
  }, [activeChatId]);

  // Restore state on app load
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (!session?.user?.email) return;
      try {
        console.log("INITIAL DATA RESTORE FOR:", session.user.email);

        // Fetch Chat History (List only, don't auto-load)
        const res = await fetch('/api/chat/history');
        const data = await res.json();

        if (isMounted) {
          if (Array.isArray(data)) {
            setSessions(data);
          }

          // Bug Fix 3: Restore previously active chat on page refresh.
          // Only restores if the stored chat ID still exists in the sessions list.
          const storedChatId = typeof window !== 'undefined'
            ? sessionStorage.getItem('dc_active_chat')
            : null;
          if (storedChatId && Array.isArray(data) && data.some((s: Session) => s.id === storedChatId)) {
            loadChat(storedChatId);
          } else if (storedChatId) {
            // Chat was deleted; remove stale entry
            sessionStorage.removeItem('dc_active_chat');
          }
        }
      } catch (err) {
        console.error('Initial fetch failed:', err);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [session?.user?.email, loadChat]);

  const createNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setDocumentId(null);
    setDocumentUrl(null);
    setDocumentText(null);
    setActiveProposalId(null);
  };

  const deleteChat = async (id: string) => {
    try {
      const res = await fetch(`/api/chat/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
        if (activeChatId === id) {
          createNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  return (
    <ChatContext.Provider value={{
      sessions,
      activeChatId,
      messages,
      loading,
      setActiveChatId,
      setMessages,
      fetchSessions,
      loadChat,
      deleteChat,
      createNewChat,
      documentId,
      setDocumentId,
      documentUrl,
      setDocumentUrl,
      documentText,
      setDocumentText,
      activeProposalId,
      setActiveProposalId,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
