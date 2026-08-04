'use client';
import React from 'react';
import { Search, X } from 'lucide-react';

interface GuideSearchProps {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
}

export default function GuideSearch({ value, onChange, resultCount }: GuideSearchProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative group w-full sm:w-80">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#F97316] transition-colors"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search Guide..."
          aria-label="Search Guide & Trust"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-9 py-2 text-sm focus:bg-white focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 transition-all outline-none"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {value && (
        <span className="text-xs font-bold text-gray-400">
          {resultCount ?? 0} result{resultCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
