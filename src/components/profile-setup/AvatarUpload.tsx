'use client';
import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Upload, User as UserIcon } from 'lucide-react';
import Image from 'next/image';

interface AvatarUploadProps {
  file: File | null;
  existingUrl: string;
  onFileSelect: (file: File | null) => void;
}

export default function AvatarUpload({ file, existingUrl, onFileSelect }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    
    if (file) {
      objectUrl = URL.createObjectURL(file);
      const url = objectUrl;
      queueMicrotask(() => setPreview(url));
    } else {
      queueMicrotask(() => setPreview(existingUrl || null));
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, existingUrl]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 5 * 1024 * 1024) {
        alert('Image must be under 5MB');
        return;
      }
      if (!f.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
      }
      onFileSelect(f);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="relative group">
        <div className="w-32 h-32 rounded-[32px] bg-[#fffaf3] border-2 border-dashed border-[#FFE4B5] overflow-hidden flex items-center justify-center transition-all group-hover:border-[#FFA000] shadow-sm">
          {preview ? (
            <Image src={preview} alt="Avatar Preview" width={128} height={128} className="w-full h-full object-cover" unoptimized />
          ) : (
            <UserIcon size={48} className="text-[#FFE4B5] group-hover:text-[#FFA000] transition-colors" />
          )}
          
          <div 
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer"
          >
            <Camera className="text-white mb-1" size={24} />
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Change Photo</span>
            <span className="text-[8px] font-medium text-white/80 mt-1 uppercase">Max 5MB</span>
          </div>
        </div>


      </div>

      <div className="flex items-center gap-3">
        <button 
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#fffaf3] border border-[#FFE4B5] text-[#FFA000] text-xs font-bold hover:bg-white hover:border-[#FFA000] transition-all"
        >
          <Upload size={14} /> {preview ? 'Change Photo' : 'Upload Avatar'}
        </button>
        {preview && (
          <button
            onClick={() => onFileSelect(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs font-bold hover:bg-red-100 transition-all"
          >
            <X size={14} /> Remove Photo
          </button>
        )}
      </div>

      <input 
        ref={inputRef} 
        type="file" 
        accept="image/*" 
        onChange={handleChange} 
        className="hidden" 
      />
      
      <p className="text-[10px] text-brand-secondary font-medium uppercase tracking-[0.1em] opacity-60 flex flex-col items-center gap-1">
        <span>Recommended: Square 400x400px</span>
        <span className="bg-gray-100 px-2 py-0.5 rounded-md text-[9px] font-bold text-gray-500">MAX FILE SIZE: 5MB</span>
      </p>
    </div>
  );
}
