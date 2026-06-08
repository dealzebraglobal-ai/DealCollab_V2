'use client';
import React, { useEffect, useRef } from 'react';
import ChatArea, { Message } from "@/components/ChatArea";
import InputBar from "@/components/InputBar";
import { ChatSkeleton } from '@/components/Skeleton';
import { Plus } from 'lucide-react';
import { useChat } from '@/components/ChatProvider';
import { useRouter } from 'next/navigation';
import { MatchPanel } from '@/components/MatchPanel';

export default function Home() {
  const {
    messages,
    loading,
    activeChatId,
    setActiveChatId,
    setMessages,
    fetchSessions,
    documentId,
    activeProposalId,
    setActiveProposalId,
  } = useChat();

  const [isTyping, setIsTyping] = React.useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (text: string, file?: File | null) => {
    if (!text.trim() && !file) return;

    // Build the display message for the user bubble
    // If file only (no text), show a placeholder so the bubble is not empty
    const displayText = text.trim() || (file ? `Please extract and analyse this document: ${file.name}` : '');

    const userMsg: Message = {
      role: 'user' as const,
      content: displayText,
      id: Date.now().toString(),
      file: file ? { name: file.name } : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      let documentText = '';
      let documentUrl = '';
      let structuredData = null;

      let documentIdLocal: string | null = null;

      if (file) {
        console.log("=== UPLOADING FILE DIRECT TO STORAGE ===", file.name, file.type, file.size);
        
        // 1. Get signed upload URL
        const signedUrlRes = await fetch(`/api/profile/upload/signed-url?file=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}&bucket=pdfs`);
        
        if (!signedUrlRes.ok) {
          const errData = await signedUrlRes.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to get upload authorization (status ${signedUrlRes.status})`);
        }
        
        const { uploadUrl, path } = await signedUrlRes.json();
        console.log("[CLIENT] Uploading directly to Supabase storage path:", path);
        
        // 2. Upload file directly using PUT
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
          },
          body: file
        });
        
        if (!uploadRes.ok) {
          throw new Error(`Direct upload to storage failed with status ${uploadRes.status}`);
        }
        
        // 3. Construct public URL
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
        }
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/pdfs/${path}`;
        console.log("[CLIENT] Direct upload successful! Public URL:", publicUrl);

        // 4. Send public URL to parse-document route for extraction
        let parseRes: Response;
        try {
          parseRes = await fetch('/api/chat/parse-document', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileUrl: publicUrl,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }),
          });
        } catch (fetchErr) {
          throw new Error(`Parse request failed: ${fetchErr}`);
        }

        console.log("=== PARSE RESPONSE STATUS ===", parseRes.status);
        
        // Safety check for non-JSON responses (timeouts, redirects, etc)
        const contentType = parseRes.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await parseRes.text();
          console.error("Non-JSON response from parse-document:", text.slice(0, 500));
          throw new Error(`Server returned an unexpected response format (${parseRes.status}). The server might be busy or timed out.`);
        }

        const parseData = await parseRes.json();
        console.log("=== PARSE RESPONSE BODY ===", JSON.stringify(parseData).slice(0, 300));

        if (!parseRes.ok || !parseData.success) {
          // Surface the error to the user clearly instead of swallowing it
          throw new Error(parseData.error || `Document parsing failed with status ${parseRes.status}`);
        }

        documentText = parseData.text || '';
        documentUrl = parseData.documentUrl || '';
        structuredData = parseData.structured || null;
        documentIdLocal = parseData.documentId || null;

        console.log("=== EXTRACTED TEXT LENGTH ===", documentText.length);
        console.log("=== EXTRACTED TEXT PREVIEW ===", documentText.slice(0, 200));

        if (!documentText || documentText.trim().length < 10) {
          throw new Error('Document appears empty or unreadable. Try a different file.');
        }
      }

      // Build the message to send to the AI
      // If user typed text AND attached a file, combine them
      // If user only attached a file with no text, use an instruction prompt
      const aiMessage = text.trim()
        ? text.trim()
        : `Please extract the deal mandate and key information from this document and begin qualification.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: aiMessage,
          document: documentText.slice(0, 3000),
          documentText: documentText.slice(0, 3000),
          chatId: activeChatId,
          documentId: documentIdLocal || (typeof documentId === 'string' ? documentId : null),
          documentUrl,
          documentStructured: structuredData,
        }),
      });

      // Safety check for non-JSON responses
      const chatContentType = response.headers.get('content-type');
      if (!chatContentType || !chatContentType.includes('application/json')) {
        const errorText = await response.text();
        console.error("Non-JSON response from chat API:", errorText.slice(0, 500));
        
        if (response.status === 504 || response.status === 500) {
          throw new Error("The AI processing is taking longer than expected. Please try again in a moment.");
        }
        throw new Error(`Server error (${response.status}). Please try again.`);
      }

      const chatData = await response.json();

      if (!response.ok || chatData.success === false) {
        throw new Error(chatData.error || 'Failed to process deal');
      }

      const aiMsg: Message = {
        role: 'assistant' as const,
        content: chatData.message || chatData.reply || 'No response',
        id: (Date.now() + 1).toString(),
        type: chatData.type,
        questions: chatData.questions,
      };

      setMessages(prev => [...prev, aiMsg]);

      // Track completion for MatchPanel
      if (chatData.is_complete && chatData.proposalId) {
        setActiveProposalId(chatData.proposalId);

        // Persist chatId → proposalId so loadChat can restore MatchPanel after refresh
        // or navigation, even for sessions where OCC prevented state.proposal_id from saving.
        const resolvedChatId = chatData.chatId || activeChatId;
        if (resolvedChatId && typeof window !== 'undefined') {
          try {
            const map = JSON.parse(sessionStorage.getItem('dc_proposal_map') || '{}') as Record<string, string>;
            map[resolvedChatId] = chatData.proposalId;
            sessionStorage.setItem('dc_proposal_map', JSON.stringify(map));
            console.log(`[home] saved proposalId=${chatData.proposalId} for chatId=${resolvedChatId}`);
          } catch { /* ignore */ }
        }
      }

      console.log(`[home] chat complete=${chatData.is_complete} proposalId=${chatData.proposalId} chatId=${chatData.chatId || activeChatId}`);

      if (!activeChatId && chatData.chatId) {
        // BUG #2 fix: when a brand-new session is created, clear any proposalId from
        // the previous session so stale MatchPanel cards don't show in the new chat.
        setActiveProposalId(null);
        setActiveChatId(chatData.chatId);
        fetchSessions();
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      console.error('[CHAT ERROR]', errorMessage);

      // Format document errors more helpfully
      const isDocError = errorMessage.includes('image-based') ||
        errorMessage.includes('IMAGE_BASED_PDF') ||
        errorMessage.includes('extract text');

      const displayMessage = isDocError
        ? '❌ This PDF contains images rather than text, so I cannot read it directly.\n\n' +
          'To fix this:\n' +
          '• Open the PDF in Word or Google Docs\n' +
          '• Save/Export as DOCX format\n' +
          '• Upload the DOCX file instead\n\n' +
          'Alternatively, paste the key deal details directly in the chat.'
        : `❌ ${errorMessage}`;

      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: displayMessage,
        id: (Date.now() + 2).toString(),
        type: 'error' as const,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  console.log(`[home render] activeChatId=${activeChatId} activeProposalId=${activeProposalId} msgs=${messages.length}`);

  return (
    <div className="flex-1 flex flex-col h-full relative bg-transparent overflow-hidden">
      {/* Scrollable Message Area */}
      <div className="flex-1 overflow-y-auto bg-transparent">
        <div className="chat-container-max px-6 py-10 pb-40">
          {loading ? (
            <div className="max-w-3xl mx-auto">
                <ChatSkeleton />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-sidebar flex items-center justify-center mb-6 border border-border">
                <Plus size={32} className="text-primary-hover" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Start a new conversation</h2>
              <p className="text-brand-secondary text-sm max-w-xs">Describe your deal, mandate, or project to begin extraction.</p>
            </div>
          ) : (
            <div className="space-y-6">
                <ChatArea 
                    messages={messages} 
                    isTyping={isTyping}
                    onQuestionClick={(q) => handleSendMessage(q, null)}
                />
                {/* Matchmaking Results Panel */}
                {activeProposalId && (
                  <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <MatchPanel
                      proposalId={activeProposalId}
                      onStartOver={() => {
                        setActiveProposalId(null);
                        router.push('/home');
                      }}
                    />
                  </div>
                )}
            </div>
          )}
          {/* Invisible element for auto-scrolling */}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Fixed Sticky Input Bar */}
      <div className="sticky bottom-0 left-0 w-full z-40">
        <InputBar onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}
