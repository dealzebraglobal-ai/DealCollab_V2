'use client';
import React from 'react';
import Skeleton from '@/components/Skeleton';

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FFF7ED] flex items-center justify-center border border-[#FFEDD5]">
            <div className="w-6 h-6 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="space-y-2 flex flex-col items-center w-full">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-3.5 w-56 rounded-full opacity-60" />
          </div>
        </div>
      </div>
    </div>
  );
}
