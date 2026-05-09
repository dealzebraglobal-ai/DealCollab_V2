'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
    setLoading(true);
    setActiveChatId(id);
    try {
      const res = await fetch(`/api/chat/sessions/${id}/messages`);
      if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to load messages: ${res.status} ${res.statusText}`, text.slice(0, 200));
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
      }

      // Fetch document linked to this chat
      const chatDetailsRes = await fetch(`/api/chat/sessions/${id}`);
      const chatDetails = await chatDetailsRes.json();
      if (chatDetails.success && chatDetails.document) {
        setDocumentId(chatDetails.document.id);
        setDocumentUrl(chatDetails.document.url);
        setDocumentText(chatDetails.document.extracted_text);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, []);


  // Restore state on app load
  useEffect(() => {
    let isMounted = true;
    
    const init = async () => {
      if (!session?.user?.email) return;
      try {
        console.log("INITIAL DATA RESTORE FOR:", session.user.email);
        
        // 2. Fetch Chat History (List only, don't auto-load)
        const res = await fetch('/api/chat/history');
        const data = await res.json();
        
        if (isMounted) {
          if (Array.isArray(data)) {
            setSessions(data);
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
      setDocumentText
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
