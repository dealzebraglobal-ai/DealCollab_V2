import React, { useState, useRef } from 'react';
import { Plus, Send } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface InputBarProps {
  onSendMessage: (text: string, file?: File | null) => void;
}

export default function InputBar({ onSendMessage }: InputBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  const isHomePage = pathname === '/home';

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputValue.trim() || pendingFile) {
      onSendMessage(inputValue.trim(), pendingFile);
      setInputValue('');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize height based on value
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
    <div className="w-full bg-transparent pb-8 pt-2 px-4 md:px-6">
      <div className="max-w-[660px] mx-auto relative group">
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,image/*"
        />
        
        <form 
          onSubmit={handleSubmit}
          data-onboarding-target="search"
          className={`flex flex-col transition-all overflow-hidden ${
            isHomePage
              ? 'bg-[#F3F4F6] hover:bg-[#EAEAEA] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#FF6A00]/30 focus-within:border-[#FF6A00]/40 border border-transparent rounded-full px-2 py-1 shadow-sm'
              : 'bg-[rgba(255,255,255,0.72)] backdrop-blur-xl border border-[rgba(17,17,17,0.08)] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:ring-1 focus-within:ring-[#FF6A00]/30 focus-within:border-[#FF6A00]/50'
          }`}
        >
          {/* File Attachment Preview Badge */}
          {pendingFile && (
            <div className={`flex items-center gap-2 px-4 py-2 ${isHomePage ? 'bg-white rounded-full mx-2 my-1 border border-[#E5E7EB]' : 'bg-[#F5F5F3] border-b border-[rgba(17,17,17,0.08)]'} animate-in slide-in-from-top-2`}>
              <div className="w-6 h-6 rounded-full bg-[#FFF7ED] shadow-sm flex items-center justify-center">
                <Plus size={14} className="text-[#FF6A00] rotate-45" />
              </div>
              <span className={`text-xs font-medium truncate max-w-[200px] ${isHomePage ? 'text-[#1F1F1F]' : 'text-[#111111]'}`}>
                {pendingFile.name}
              </span>
              <button 
                type="button"
                onClick={() => setPendingFile(null)}
                className="ml-auto p-1 hover:bg-black/5 rounded-full transition-colors"
              >
                <Plus size={14} className="text-[#747775] rotate-45" />
              </button>
            </div>
          )}

          <div className="flex items-center relative py-1">
            <button 
              type="button"
              onClick={handlePlusClick}
              className={`flex-shrink-0 w-11 h-11 flex items-center justify-center transition-colors z-10 rounded-full ${
                isHomePage
                  ? 'text-[#444746] hover:text-[#1F1F1F] hover:bg-black/5'
                  : 'text-[#4B5563] hover:text-[#111111]'
              }`}
              title="Attach Document"
            >
              <Plus size={20} className={pendingFile ? "text-[#FF6A00]" : ""} />
            </button>
   
            <div className="flex-1 flex items-center relative">
              <textarea 
                ref={textareaRef}
                value={inputValue || ""}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pendingFile ? "Add a message about this document..." : "Ask DealCollab AI anything..."} 
                rows={1}
                autoFocus
                enterKeyHint="send"
                className={`flex-1 bg-transparent border-none outline-none font-normal text-[15px] py-2 px-1 pr-3 resize-none min-h-[24px] max-h-[200px] scrollbar-hide relative z-20 ${
                  isHomePage
                    ? 'text-[#1F1F1F] placeholder:text-[#747775]'
                    : 'text-[#111111] placeholder:text-[#4B5563]/60'
                }`}
                style={{ height: 'auto' }}
              />
              
              <button 
                type="submit"
                disabled={!inputValue.trim() && !pendingFile}
                className={`mr-2 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-25 active:scale-95 shadow-sm shrink-0 z-10 ${
                  isHomePage
                    ? 'bg-[#FF6A00] hover:bg-[#E65C00] text-white shadow-orange-500/20'
                    : 'bg-[#111111] hover:bg-[#FF6A00] text-white'
                }`}
              >
                <Send size={15} className="ml-0.5" />
              </button>
            </div>
          </div>
        </form>
        
        <p className={`text-center text-[11px] mt-3 font-normal ${isHomePage ? 'text-[#747775]' : 'text-[#4B5563] uppercase tracking-[0.1em] opacity-60'}`}>
          DealCollab AI can make mistakes. Verify important deal and counterparty information.
        </p>
      </div>
    </div>
  );
}
