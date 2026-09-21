import React, { useState, useRef } from 'react';
import { Plus, ArrowUp, X, Loader2 } from 'lucide-react';

interface InputBarProps {
  onSendMessage: (text: string, file?: File | null) => void;
  isSending?: boolean;
}

// Clean, minimal, ChatGPT-inspired search-box pattern — a rounded rectangle
// (not a pill/oval), white surface, one neutral border, no orange outline by
// default. Orange is reserved for the send button and a subtle focus ring,
// per the "orange for accents, not for the container" design direction.
export default function InputBar({ onSendMessage, isSending = false }: InputBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = (inputValue.trim().length > 0 || !!pendingFile) && !isSending;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    onSendMessage(inputValue.trim(), pendingFile);
    setInputValue('');
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Shift+Enter falls through to the textarea's default newline behavior.
  };

  // Auto-resize height based on value, capped so the box never dominates the page.
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const handlePlusClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full bg-transparent pb-5 pt-1 px-3 sm:px-6">
      <div className="max-w-[720px] mx-auto">
        {/* Same upload pipeline as before — JPG/JPEG, PDF, DOC/DOCX, TXT — this
            attachment button is the only entry point, no second upload path. */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,image/*"
        />

        <form
          onClick={() => textareaRef.current?.focus()}
          onSubmit={handleSubmit}
          data-onboarding-target="search"
          className="cursor-text flex flex-col bg-white border border-gray-200 rounded-[28px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.12)] focus-within:border-[#EA580C] focus-within:ring-[3px] focus-within:ring-[#EA580C]/15 transition-all duration-200"
        >
          {/* File Attachment Preview Badge */}
          {pendingFile && (
            <div className="flex items-center gap-2 mx-3 mt-3 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl animate-in slide-in-from-top-2">
              <div className="w-5 h-5 rounded-full bg-[#FFF7ED] shrink-0 flex items-center justify-center">
                <Plus size={12} className="text-[#C2410C] rotate-45" />
              </div>
              <span className="text-xs font-medium text-gray-700 truncate max-w-[220px]">
                {pendingFile.name}
              </span>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                className="ml-auto p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-full transition-colors"
                title="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-1.5 px-2.5 py-2 sm:px-3">
            <button
              type="button"
              onClick={handlePlusClick}
              disabled={isSending}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Attach a document or image (PDF, DOCX, TXT, JPG)"
            >
              <Plus size={18} className={pendingFile ? 'text-[#C2410C]' : ''} />
            </button>

            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingFile ? 'Add a message about this document...' : 'Ask DealCollab about a deal, mandate, or opportunity...'}
              rows={1}
              disabled={isSending}
              autoFocus
              enterKeyHint="send"
              className="flex-1 bg-transparent border-none outline-none font-normal text-[14px] leading-6 py-1.5 px-1 resize-none min-h-[24px] max-h-[200px] overflow-y-auto scrollbar-hide text-gray-900 placeholder:text-gray-400 disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!canSend}
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed bg-[#EA580C] hover:bg-[#C2410C] text-white shadow-md"
              title="Send"
            >
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
            </button>
          </div>
        </form>

        <p className="text-center text-[10.5px] mt-2 font-normal text-gray-400">
          DealCollab AI can make mistakes. Verify important deal and counterparty information.
        </p>
      </div>
    </div>
  );
}
