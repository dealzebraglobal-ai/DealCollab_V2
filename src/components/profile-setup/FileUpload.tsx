'use client';
import React, { useRef, useState } from 'react';
import { Upload, FileText, X, CheckCircle2 } from 'lucide-react';
import { ACCEPTED_FILE_EXTENSIONS, MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, ACCEPTED_FILE_TYPES } from '@/lib/validation/profile';

interface FileUploadProps {
  label?: string;
  file: File | null;
  existingUrl: string;
  onFileSelect: (file: File | null) => void;
}

export default function FileUpload({ label = 'Attach Professional / Company Profile', file, existingUrl, onFileSelect }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndSet = (f: File) => {
    setError(null);
    if (!ACCEPTED_FILE_TYPES.includes(f.type as typeof ACCEPTED_FILE_TYPES[number])) {
      setError('Only PDF, DOC, DOCX, PPT, PPTX files accepted');
      return;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(`File must be under ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    onFileSelect(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSet(f);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) validateAndSet(f);
  };

  const displayName = file?.name || (existingUrl ? existingUrl.split('/').pop() : null);

  return (
    <div className="space-y-3 w-full">
      <label className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-70 px-1 block">
        {label}
      </label>
      <div
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative w-full p-8 rounded-[24px] border-2 border-dashed transition-all cursor-pointer text-center ${
          dragActive ? 'border-brand-accent bg-brand-accent/5 scale-[1.01]' :
          displayName ? 'border-green-300 bg-green-50/30' :
          'border-gray-200 bg-gray-50/50 hover:border-brand-accent/50 hover:bg-brand-accent/5'
        }`}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED_FILE_EXTENSIONS.join(',')} onChange={handleChange} className="hidden" />
        {displayName ? (
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-500">
              <CheckCircle2 size={24} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-foreground truncate max-w-[240px]">{displayName}</p>
              <p className="text-[11px] text-brand-secondary">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Previously uploaded'}</p>
            </div>
            <button type="button" onClick={e => { e.stopPropagation(); onFileSelect(null); setError(null); }} className="w-8 h-8 rounded-xl bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-all">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-colors ${dragActive ? 'bg-brand-accent text-white' : 'bg-gray-100 text-gray-400'}`}>
              {dragActive ? <FileText size={28} /> : <Upload size={28} />}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Drop your file here or <span className="text-brand-accent">browse</span></p>
              <p className="text-[11px] text-brand-secondary mt-1">PDF, DOC, DOCX, PPT, PPTX · Max {MAX_FILE_SIZE_MB}MB</p>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-[11px] font-bold text-red-500 px-2">{error}</p>}
    </div>
  );
}
